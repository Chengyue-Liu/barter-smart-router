import { ChainId } from '@pancakeswap/sdk';
import { default as retry } from 'async-retry';
import Timeout from 'await-timeout';
import { gql, GraphQLClient } from 'graphql-request';
import _ from 'lodash';
import { log } from '../../../util/log';
import { Token as TokenRaw } from '../../../util/token';
import {
  IV2SubgraphProvider,
  RawBNBV2SubgraphPool,
  V2SubgraphPool,
} from '../../interfaces/ISubgraphProvider';
import { ProviderConfig } from '../../provider';

const SUBGRAPH_URL_BY_CHAIN: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]:
    'https://bsc.streamingfast.io/subgraphs/name/pancakeswap/exchange-v2',
};

const threshold = 0.025;

const PAGE_SIZE = 1000; // 1k is max possible query size from subgraph.

export class PancakeSubgraphProvider implements IV2SubgraphProvider {
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
    _tokenIn?: TokenRaw,
    _tokenOut?: TokenRaw,
    providerConfig?: ProviderConfig
  ): Promise<V2SubgraphPool[]> {
    let blockNumber = providerConfig?.blockNumber
      ? await providerConfig.blockNumber
      : undefined;
    // Due to limitations with the Subgraph API this is the only way to parameterize the query.
    const query2 = gql`
      query getPools($pageSize: Int!, $id: String) {
        pairs(
          where: {id_gt: $id}
          first: $pageSize
          ${blockNumber ? `block: { number: ${blockNumber} }` : ``}
          orderBy: volumeUSD
          orderDirection: desc
        ) {
          id
          token0 { id, symbol }
          token1 { id, symbol }
          totalSupply
          reserveBNB
          trackedReserveBNB
        }
      }
    `;
    let pools: RawBNBV2SubgraphPool[] = [];
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

        const getPools = async (): Promise<RawBNBV2SubgraphPool[]> => {
          let lastId: string = '';
          let pairs: RawBNBV2SubgraphPool[] = [];
          let pairsPage: RawBNBV2SubgraphPool[] = [];

          await retry(
            async () => {
              const poolsResult = await this.client.request<{
                pairs: RawBNBV2SubgraphPool[];
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

    return this.sanitizePools(pools);
  }

  public sanitizePools(pools: RawBNBV2SubgraphPool[]): V2SubgraphPool[] {
    // TODO: Remove. Temporary fix to ensure tokens without trackedReserveBNB are in the list.
    const FEI = '0x956f47f50a910163d8bf957cf5846d573e7f87ca';
    const poolsSanitized: V2SubgraphPool[] = pools
      .filter((pool) => {
        return (
          pool.token0.id == FEI ||
          pool.token1.id == FEI ||
          parseFloat(pool.trackedReserveBNB) > threshold
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
          reserve: parseFloat(pool.trackedReserveBNB),
        };
      });

    log.info(
      `Got ${pools.length} V2 pools from the subgraph. ${poolsSanitized.length} after filtering`
    );
    return poolsSanitized;
  }
}
