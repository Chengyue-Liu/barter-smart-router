import { TradeType } from '@pancakeswap/sdk';
import { Protocol } from '@uniswap/router-sdk';
import { Token as UToken } from '@uniswap/sdk-core';
import _ from 'lodash';
import { ITokenListProvider, ITokenProvider } from '../../../providers';
import {
  IV2PoolProvider,
  V2PoolAccessor,
} from '../../../providers/interfaces/IPoolProvider';
import {
  RawBNBV2SubgraphPool,
  V2SubgraphPool,
} from '../../../providers/interfaces/ISubgraphProvider';
import {
  BUSD_BNB,
  USDC_BNB,
  USDT_BNB,
  WBNB_BNB,
} from '../../../providers/pancakeswap/util/token-provider';
import { ChainId, WRAPPED_NATIVE_CURRENCY } from '../../../util';
import { log } from '../../../util/log';
import { metric, MetricLoggerUnit } from '../../../util/metric';
import { sanitizeBSCPools } from '../../../util/pool';
import { Token } from '../../../util/token';
import { AlphaRouterConfig } from '../alpha-router';

export type PoolId = { id: string };
export type CandidatePoolsBySelectionCriteria = {
  protocol: Protocol;
  selections: {
    topByBaseWithTokenIn: PoolId[];
    topByBaseWithTokenOut: PoolId[];
    topByDirectSwapPool: PoolId[];
    topByEthQuoteTokenPool: PoolId[];
    topByTVL: PoolId[];
    topByTVLUsingTokenIn: PoolId[];
    topByTVLUsingTokenOut: PoolId[];
    topByTVLUsingTokenInSecondHops: PoolId[];
    topByTVLUsingTokenOutSecondHops: PoolId[];
  };
};

export type PancakeV2GetCandidatePoolsParams = {
  tokenIn: Token;
  tokenOut: Token;
  routeType: TradeType;
  routingConfig: AlphaRouterConfig;
  allPoolsUnsanitized: RawBNBV2SubgraphPool[];
  tokenProvider: ITokenProvider;
  poolProvider: IV2PoolProvider;
  blockedTokenListProvider?: ITokenListProvider;
  chainId: ChainId;
};

const baseTokensByChain: { [chainId in ChainId]?: Token[] } = {
  [ChainId.BSC]: [USDC_BNB, USDT_BNB, WBNB_BNB, BUSD_BNB],
};
export async function getPancakeV2CandidatePools({
  tokenIn,
  tokenOut,
  routeType,
  routingConfig,
  allPoolsUnsanitized,
  tokenProvider,
  poolProvider,
  blockedTokenListProvider,
  chainId,
}: PancakeV2GetCandidatePoolsParams): Promise<{
  poolAccessor: V2PoolAccessor;
  candidatePools: CandidatePoolsBySelectionCriteria;
}> {
  const {
    blockNumber,
    v2PoolSelection: {
      topN,
      topNDirectSwaps,
      topNTokenInOut,
      topNSecondHop,
      topNWithEachBaseToken,
      topNWithBaseToken,
    },
  } = routingConfig;
  const tokenInAddress = tokenIn.address.toLowerCase();
  const tokenOutAddress = tokenOut.address.toLowerCase();

  const beforeSubgraphPools = Date.now();
  const allPoolsRaw = sanitizeBSCPools(allPoolsUnsanitized);
  const allPools = _.map(allPoolsRaw, (pool) => {
    return {
      ...pool,
      token0: {
        ...pool.token0,
        id: pool.token0.id.toLowerCase(),
      },
      token1: {
        ...pool.token1,
        id: pool.token1.id.toLowerCase(),
      },
    };
  });
  metric.putMetric(
    'V2SubgraphPoolsLoad',
    Date.now() - beforeSubgraphPools,
    MetricLoggerUnit.Milliseconds
  );

  // Only consider pools where neither tokens are in the blocked token list.
  let filteredPools: V2SubgraphPool[] = allPools;
  if (blockedTokenListProvider) {
    filteredPools = [];
    for (const pool of allPools) {
      const token0InBlocklist =
        await blockedTokenListProvider.getTokenByAddress(pool.token0.id);
      const token1InBlocklist =
        await blockedTokenListProvider.getTokenByAddress(pool.token1.id);

      if (token0InBlocklist || token1InBlocklist) {
        continue;
      }

      filteredPools.push(pool);
    }
  }

  const subgraphPoolsSorted = _(filteredPools)
    .sortBy((tokenListPool) => -tokenListPool.reserve)
    .value();

  log.info(
    `After filtering blocked tokens went from ${allPools.length} to ${subgraphPoolsSorted.length}.`
  );

  const poolAddressesSoFar = new Set<string>();
  const addToAddressSet = (pools: V2SubgraphPool[]) => {
    _(pools)
      .map((pool) => pool.id)
      .forEach((poolAddress) => poolAddressesSoFar.add(poolAddress));
  };

  const baseTokens = baseTokensByChain[chainId] ?? [];
  const topByBaseWithTokenIn = _(baseTokens)
    .flatMap((token: Token) => {
      return _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
          const tokenAddress = token.address.toLowerCase();
          return (
            (subgraphPool.token0.id == tokenAddress &&
              subgraphPool.token1.id == tokenInAddress) ||
            (subgraphPool.token1.id == tokenAddress &&
              subgraphPool.token0.id == tokenInAddress)
          );
        })
        .sortBy((tokenListPool) => -tokenListPool.reserve)
        .slice(0, topNWithEachBaseToken)
        .value();
    })
    .sortBy((tokenListPool) => -tokenListPool.reserve)
    .slice(0, topNWithBaseToken)
    .value();
  const topByBaseWithTokenOut = _(baseTokens)
    .flatMap((token: Token) => {
      return _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
          const tokenAddress = token.address.toLowerCase();
          return (
            (subgraphPool.token0.id == tokenAddress &&
              subgraphPool.token1.id == tokenOutAddress) ||
            (subgraphPool.token1.id == tokenAddress &&
              subgraphPool.token0.id == tokenOutAddress)
          );
        })
        .sortBy((tokenListPool) => -tokenListPool.reserve)
        .slice(0, topNWithEachBaseToken)
        .value();
    })
    .sortBy((tokenListPool) => -tokenListPool.reserve)
    .slice(0, topNWithBaseToken)
    .value();

  // Always add the direct swap pool into the mix regardless of if it exists in the subgraph pool list.
  // Ensures that new pools can be swapped on immediately, and that if a pool was filtered out of the
  // subgraph query for some reason (e.g. trackedReserveETH was 0), then we still consider it.
  let topByDirectSwapPool: V2SubgraphPool[] = [];
  if (topNDirectSwaps != 0) {
    const { token0, token1, poolAddress } = poolProvider.getPoolAddress(
      tokenIn,
      tokenOut
    );

    topByDirectSwapPool = [
      {
        id: poolAddress,
        token0: {
          id: token0.address,
        },
        token1: {
          id: token1.address,
        },
        supply: 10000, // Not used. Set to arbitrary number.
        reserve: 10000, // Not used. Set to arbitrary number.
      },
    ];
  }

  addToAddressSet(topByDirectSwapPool);

  const wbnbAddress = WRAPPED_NATIVE_CURRENCY[56]!.address;

  // Main reason we need this is for gas estimates, only needed if token out is not ETH.
  // We don't check the seen address set because if we've already added pools for getting ETH quotes
  // theres no need to add more.
  // Note: we do not need to check other native currencies for the V2 Protocol
  let topByEthQuoteTokenPool: V2SubgraphPool[] = [];
  if (
    tokenOut.symbol != 'WETH' &&
    tokenOut.symbol != 'WETH9' &&
    tokenOut.symbol != 'ETH'
  ) {
    topByEthQuoteTokenPool = _(subgraphPoolsSorted)
      .filter((subgraphPool) => {
        if (routeType == TradeType.EXACT_INPUT) {
          return (
            (subgraphPool.token0.id == wbnbAddress &&
              subgraphPool.token1.id == tokenOutAddress) ||
            (subgraphPool.token1.id == wbnbAddress &&
              subgraphPool.token0.id == tokenOutAddress)
          );
        } else {
          return (
            (subgraphPool.token0.id == wbnbAddress &&
              subgraphPool.token1.id == tokenInAddress) ||
            (subgraphPool.token1.id == wbnbAddress &&
              subgraphPool.token0.id == tokenInAddress)
          );
        }
      })
      .slice(0, 1)
      .value();
  }

  addToAddressSet(topByEthQuoteTokenPool);

  const topByTVL = _(subgraphPoolsSorted)
    .filter((subgraphPool) => {
      return !poolAddressesSoFar.has(subgraphPool.id);
    })
    .slice(0, topN)
    .value();

  addToAddressSet(topByTVL);

  const topByTVLUsingTokenIn = _(subgraphPoolsSorted)
    .filter((subgraphPool) => {
      return (
        !poolAddressesSoFar.has(subgraphPool.id) &&
        (subgraphPool.token0.id == tokenInAddress ||
          subgraphPool.token1.id == tokenInAddress)
      );
    })
    .slice(0, topNTokenInOut)
    .value();

  addToAddressSet(topByTVLUsingTokenIn);

  const topByTVLUsingTokenOut = _(subgraphPoolsSorted)
    .filter((subgraphPool) => {
      return (
        !poolAddressesSoFar.has(subgraphPool.id) &&
        (subgraphPool.token0.id == tokenOutAddress ||
          subgraphPool.token1.id == tokenOutAddress)
      );
    })
    .slice(0, topNTokenInOut)
    .value();

  addToAddressSet(topByTVLUsingTokenOut);

  const topByTVLUsingTokenInSecondHops = _(topByTVLUsingTokenIn)
    .map((subgraphPool) => {
      return tokenInAddress == subgraphPool.token0.id
        ? subgraphPool.token1.id
        : subgraphPool.token0.id;
    })
    .flatMap((secondHopId: string) => {
      return _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
          return (
            !poolAddressesSoFar.has(subgraphPool.id) &&
            (subgraphPool.token0.id == secondHopId ||
              subgraphPool.token1.id == secondHopId)
          );
        })
        .slice(0, topNSecondHop)
        .value();
    })
    .uniqBy((pool) => pool.id)
    .sortBy((tokenListPool) => -tokenListPool.reserve)
    .slice(0, topNSecondHop)
    .value();

  addToAddressSet(topByTVLUsingTokenInSecondHops);
  const topByTVLUsingTokenOutSecondHops = _(topByTVLUsingTokenOut)
    .map((subgraphPool) => {
      return tokenOutAddress == subgraphPool.token0.id
        ? subgraphPool.token1.id
        : subgraphPool.token0.id;
    })
    .flatMap((secondHopId: string) => {
      return _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
          return (
            !poolAddressesSoFar.has(subgraphPool.id) &&
            (subgraphPool.token0.id == secondHopId ||
              subgraphPool.token1.id == secondHopId)
          );
        })
        .slice(0, topNSecondHop)
        .value();
    })
    .uniqBy((pool) => pool.id)
    .sortBy((tokenListPool) => -tokenListPool.reserve)
    .slice(0, topNSecondHop)
    .value();

  addToAddressSet(topByTVLUsingTokenOutSecondHops);

  const subgraphPools = _([
    ...topByBaseWithTokenIn,
    ...topByBaseWithTokenOut,
    ...topByDirectSwapPool,
    ...topByEthQuoteTokenPool,
    ...topByTVL,
    ...topByTVLUsingTokenIn,
    ...topByTVLUsingTokenOut,
    ...topByTVLUsingTokenInSecondHops,
    ...topByTVLUsingTokenOutSecondHops,
  ])
    .compact()
    .uniqBy((pool) => pool.id)
    .value();
  const tokenAddresses = _(subgraphPools)
    .flatMap((subgraphPool) => [subgraphPool.token0.id, subgraphPool.token1.id])
    .compact()
    .uniq()
    .value();
  log.info(
    `Getting the ${tokenAddresses.length} tokens within the ${subgraphPools.length} V2 pools we are considering`
  );

  const tokenAccessor = await tokenProvider.getTokens(tokenAddresses, {
    blockNumber,
  });

  const printV2SubgraphPool = (s: V2SubgraphPool) =>
    `${tokenAccessor.getTokenByAddress(s.token0.id)?.symbol ?? s.token0.id}/${
      tokenAccessor.getTokenByAddress(s.token1.id)?.symbol ?? s.token1.id
    }`;
  log.info(
    {
      topByBaseWithTokenIn: topByBaseWithTokenIn.map(printV2SubgraphPool),
      topByBaseWithTokenOut: topByBaseWithTokenOut.map(printV2SubgraphPool),
      topByTVL: topByTVL.map(printV2SubgraphPool),
      topByTVLUsingTokenIn: topByTVLUsingTokenIn.map(printV2SubgraphPool),
      topByTVLUsingTokenOut: topByTVLUsingTokenOut.map(printV2SubgraphPool),
      topByTVLUsingTokenInSecondHops:
        topByTVLUsingTokenInSecondHops.map(printV2SubgraphPool),
      topByTVLUsingTokenOutSecondHops:
        topByTVLUsingTokenOutSecondHops.map(printV2SubgraphPool),
      top2DirectSwap: topByDirectSwapPool.map(printV2SubgraphPool),
      top2EthQuotePool: topByEthQuoteTokenPool.map(printV2SubgraphPool),
    },
    `V2 Candidate pools`
  );

  const tokenPairsRaw = _.map<V2SubgraphPool, [UToken, UToken] | undefined>(
    subgraphPools,
    (subgraphPool) => {
      const tokenA = tokenAccessor.getTokenByAddress(subgraphPool.token0.id);
      const tokenB = tokenAccessor.getTokenByAddress(subgraphPool.token1.id);

      if (!tokenA || !tokenB) {
        log.info(
          `Dropping candidate pool for ${subgraphPool.token0.id}/${subgraphPool.token1.id}`
        );
        return undefined;
      }

      return [tokenA, tokenB];
    }
  );

  const tokenPairs = _.compact(tokenPairsRaw);

  const beforePoolsLoad = Date.now();
  const poolAccessor = await poolProvider.getPools(tokenPairs, {
    blockNumber,
  });
  metric.putMetric(
    'V2PoolsLoad',
    Date.now() - beforePoolsLoad,
    MetricLoggerUnit.Milliseconds
  );

  const poolsBySelection: CandidatePoolsBySelectionCriteria = {
    protocol: Protocol.V2,
    selections: {
      topByBaseWithTokenIn,
      topByBaseWithTokenOut,
      topByDirectSwapPool,
      topByEthQuoteTokenPool: topByEthQuoteTokenPool,
      topByTVL,
      topByTVLUsingTokenIn,
      topByTVLUsingTokenOut,
      topByTVLUsingTokenInSecondHops,
      topByTVLUsingTokenOutSecondHops,
    },
  };
  return { poolAccessor, candidatePools: poolsBySelection };
}
