import { default as retry } from 'async-retry';
import Timeout from 'await-timeout';
import { gql, GraphQLClient } from 'graphql-request';
import _ from 'lodash';
import { ChainId } from '../../../util';
import { log } from '../../../util/log';
import { Token } from '../../../util/token';
import {
  IV2SubgraphProvider,
  RawETHV2SubgraphPool,
  V2SubgraphPool,
} from '../../interfaces/ISubgraphProvider';
import { ProviderConfig } from '../../provider';

const SUBGRAPH_URL_BY_CHAIN: { [chainId in ChainId]?: string } = {
  [ChainId.POLYGON]:
    'https://api.thegraph.com/subgraphs/name/sameepsi/quickswap06',
  [ChainId.MAINNET]: 'https://polygon.furadao.org/subgraphs/name/quickswap',
};

const threshold = 0.025;

const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.

export class QuickSubgraphProvider implements IV2SubgraphProvider {
  private client: GraphQLClient;

  constructor(
    private chainId: ChainId,
    private retries = 2,
    private timeout = 360000,
    private rollback = true
  ) {
    const subgraphUrl = SUBGRAPH_URL_BY_CHAIN[this.chainId];
    if (!subgraphUrl) {
      throw new Error(`No subgraph url for chain id: ${this.chainId}`);
    }
    this.client = new GraphQLClient(subgraphUrl);
  }

  public async getPools(
    _tokenIn?: Token,
    _tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<V2SubgraphPool[]> {
    let blockNumber = providerConfig?.blockNumber
      ? await providerConfig.blockNumber
      : undefined;
    // Due to limitations with the Subgraph API this is the only way to parameterize the query.
    const query2 = gql`
      query getPools($pageSize: Int!, $id: String) {
        pairs(
          first: $pageSize
          ${blockNumber ? `block: { number: ${blockNumber} }` : ``}
          where: { id_gt: $id }
        ) {
          id
          token0 { id, symbol }
          token1 { id, symbol }
          totalSupply
          reserveETH
          trackedReserveETH
        }
      }
    `;

    let pools: RawETHV2SubgraphPool[] = [];

    log.info(
      `Getting V2 pools from the subgraph with page size ${PAGE_SIZE}${
        providerConfig?.blockNumber
          ? ` as of block ${providerConfig?.blockNumber}`
          : ''
      }.`
    );

    await retry(
      async () => {
        const timeout = new Timeout();

        const getPools = async (): Promise<RawETHV2SubgraphPool[]> => {
          let lastId: string = '';
          let pairs: RawETHV2SubgraphPool[] = [];
          let pairsPage: RawETHV2SubgraphPool[] = [];

          do {
            await retry(
              async () => {
                const poolsResult = await this.client.request<{
                  pairs: RawETHV2SubgraphPool[];
                }>(query2, {
                  pageSize: PAGE_SIZE,
                  id: lastId,
                });

                pairsPage = poolsResult.pairs;

                pairs = pairs.concat(pairsPage);
                lastId = pairs[pairs.length - 1]!.id;
              },
              {
                retries: this.retries,
                onRetry: (err, retry) => {
                  pools = [];
                  log.info(
                    { err },
                    `Failed request for page of pools from subgraph. Retry attempt: ${retry}`
                  );
                },
              }
            );
          } while (pairsPage.length > 0);
          return pairs;
        };
        try {
          const getPoolsPromise = getPools();
          const timerPromise = timeout.set(this.timeout).then(() => {
            throw new Error(
              `Timed out getting pools from subgraph: ${this.timeout}`
            );
          });
          pools = await Promise.race([getPoolsPromise, timerPromise]);
          return;
        } catch (err) {
          throw err;
        } finally {
          timeout.clear();
        }
      },
      {
        retries: this.retries,
        onRetry: (err, retry) => {
          if (
            this.rollback &&
            blockNumber &&
            _.includes(err.message, 'indexed up to')
          ) {
            blockNumber = blockNumber - 10;
            log.info(
              `Detected subgraph indexing error. Rolled back block number to: ${blockNumber}`
            );
          }
          pools = [];
          log.info(
            { err },
            `Failed to get pools from subgraph. Retry attempt: ${retry}`
          );
        },
      }
    );

    // Filter pools that have tracked reserve ETH less than threshold.
    // trackedReserveETH filters pools that do not involve a pool from this allowlist:
    // https://github.com/Uniswap/v2-subgraph/blob/7c82235cad7aee4cfce8ea82f0030af3d224833e/src/mappings/pricing.ts#L43
    // Which helps filter pools with manipulated prices/liquidity.

    // TODO: Remove. Temporary fix to ensure tokens without trackedReserveETH are in the list.
    const FEI = '0x956f47f50a910163d8bf957cf5846d573e7f87ca';

    const poolsSanitized: V2SubgraphPool[] = pools
      .filter((pool) => {
        return (
          pool.token0.id == FEI ||
          pool.token1.id == FEI ||
          parseFloat(pool.trackedReserveETH) > threshold
        );
      })
      .map((pool) => {
        return {
          ...pool,
          id: pool.id.toLowerCase(),
          token0: {
            id: pool.token0.id.toLowerCase(),
          },
          token1: {
            id: pool.token1.id.toLowerCase(),
          },
          supply: parseFloat(pool.totalSupply),
          reserve: parseFloat(pool.trackedReserveETH),
        };
      });

    log.info(
      `Got ${pools.length} V2 pools from the subgraph. ${poolsSanitized.length} after filtering`
    );

    return poolsSanitized;
  }
}
