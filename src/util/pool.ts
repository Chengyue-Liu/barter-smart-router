import axios from 'axios';
import {
  RawBNBV2SubgraphPool,
  RawETHV2SubgraphPool,
  V2SubgraphPool,
} from '../providers/interfaces/ISubgraphProvider';
import {
  RawV3SubgraphPool,
  V3SubgraphPool,
} from '../providers/uniswap/v3/subgraph-provider';
import { BarterProtocol } from './protocol';
import { BARTER_SERVER_URL } from './urls';

const bscThreshold = 0.25;
const ethThreshold = 0.025;

export function sanitizeBSCPools(
  pools: RawBNBV2SubgraphPool[]
): V2SubgraphPool[] {
  // TODO: Remove. Temporary fix to ensure tokens without trackedReserveBNB are in the list.
  const FEI = '0x956f47f50a910163d8bf957cf5846d573e7f87ca';
  const poolsSanitized: V2SubgraphPool[] = pools
    .filter((pool) => {
      return (
        pool.token0.id == FEI ||
        pool.token1.id == FEI ||
        parseFloat(pool.trackedReserveBNB) > bscThreshold
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
  return poolsSanitized;
}

export function sanitizeV3Pools(pools: RawV3SubgraphPool[]): V3SubgraphPool[] {
  const poolsSanitized = pools
    .filter((pool) => parseInt(pool.liquidity) > 0)
    .map((pool) => {
      const { totalValueLockedETH, totalValueLockedUSD, ...rest } = pool;

      return {
        ...rest,
        id: pool.id.toLowerCase(),
        token0: {
          id: pool.token0.id.toLowerCase(),
        },
        token1: {
          id: pool.token1.id.toLowerCase(),
        },
        tvlETH: parseFloat(totalValueLockedETH),
        tvlUSD: parseFloat(totalValueLockedUSD),
      };
    });
  return poolsSanitized;
}
export function sanitizeETHV2Pools(
  pools: RawETHV2SubgraphPool[]
): V2SubgraphPool[] {
  // TODO: Remove. Temporary fix to ensure tokens without trackedReserveBNB are in the list.
  const FEI = '0x956f47f50a910163d8bf957cf5846d573e7f87ca';
  const poolsSanitized: V2SubgraphPool[] = pools
    .filter((pool) => {
      return (
        pool.token0.id == FEI ||
        pool.token1.id == FEI ||
        parseFloat(pool.trackedReserveETH) > ethThreshold
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
  return poolsSanitized;
}

export async function getETHPoolsFromServer(
  protocolSet: Set<BarterProtocol>,
  chainId: number
): Promise<string> {
  const requestUrl = assemblePoolRequest(protocolSet, chainId);
  console.log(requestUrl);
  try {
    const allPoolsUnsanitizedJsonStr = await axios.get(requestUrl);
    return JSON.stringify(allPoolsUnsanitizedJsonStr.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error();
    } else {
      throw new Error();
    }
  }
}

export async function getBSCPoolsFromServer(
  protocolSet: Set<BarterProtocol>,
  chainId: number
): Promise<string> {
  const requestUrl = assemblePoolRequest(protocolSet, chainId);
  try {
    const allPoolsUnsanitizedJsonStr = await axios.get(requestUrl);
    return JSON.stringify(allPoolsUnsanitizedJsonStr.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error();
    } else {
      throw new Error();
    }
  }
}

export function getBSCPoolsFromOneProtocol(
  allPoolsUnsanitizedJsonStr: string,
  protocol: BarterProtocol
): RawBNBV2SubgraphPool[] {
  const allPools = JSON.parse(allPoolsUnsanitizedJsonStr);
  switch (protocol) {
    case BarterProtocol.PANCAKESWAP:
      return allPools.pancakeswap;
    default:
      throw new Error(`protocol ${protocol} not supported yet on bsc`);
  }
}

export function getETHV2PoolsFromOneProtocol(
  allPoolsUnsanitizedJsonStr: string,
  protocol: BarterProtocol
): RawETHV2SubgraphPool[] {
  const allPools = JSON.parse(allPoolsUnsanitizedJsonStr);
  switch (protocol) {
    case BarterProtocol.UNI_V2:
      return allPools.uniswap_v2;
    case BarterProtocol.SUSHISWAP:
      return allPools.sushiswap;
    case BarterProtocol.QUICKSWAP:
      return allPools.quickswap;
    default:
      throw new Error(`protocol ${protocol} not supported yet on eth`);
  }
}

export function getETHV3PoolsFromOneProtocol(
  allPoolsUnsanitizedJsonStr: string,
  protocol: BarterProtocol
): RawV3SubgraphPool[] {
  const allPools = JSON.parse(allPoolsUnsanitizedJsonStr);
  switch (protocol) {
    case BarterProtocol.UNI_V3:
      return allPools.uniswap_v3;
    default:
      throw new Error(`protocol ${protocol} not supported yet on eth`);
  }
}
function assemblePoolRequest(
  protocolSet: Set<BarterProtocol>,
  chainId: number
): string {
  let request = BARTER_SERVER_URL;
  let protocolArr = [];
  for (let protocol of protocolSet) {
    if (protocol === BarterProtocol.UNI_V2) {
      protocolArr.push('uniswap-v2');
    } else if (protocol === BarterProtocol.UNI_V3) {
      protocolArr.push('uniswap-v3');
    } else {
      protocolArr.push(protocol.toLowerCase());
    }
  }
  const protocolParam = protocolArr.join(',');
  request += '/get-pools?protocol=' + protocolParam;
  request += '&&chainId=' + chainId;
  return request;
}
