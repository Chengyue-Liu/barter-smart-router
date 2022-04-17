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

const bscThreshold = 0.25;
const ethThreshold = 0.025;

const barterServerUrl = '';

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

export async function getETHPoolsByHttp(
  protocolSet: Set<BarterProtocol>,
  chainId: number
): Promise<string> {
  const request = assemblePoolRequest(protocolSet, chainId);
  const allPoolsUnsanitizedJsonStr =
    '{"uniswap_v2":[{"id":"0x00004ee988665cdda9a1080d5792cecd16dc1220","reserveETH":0.06180964849520753,"token0":{"id":"0x4d44d6c288b7f32ff676a4b2dafd625992f8ffbd","symbol":"SLC"},"token1":{"id":"0xdac17f958d2ee523a2206206994597c13d831ec7","symbol":"USDT"},"totalSupply":8.959536207295e-5,"trackedReserveETH":0.06180964849520753},{"id":"0x0000871c95bb027c90089f4926fd1ba82cdd9a8b","reserveETH":2.82e-16,"token0":{"id":"0x5152e1cb69a2ffa3997e89cbb4aba76a01d82141","symbol":"HORE"},"token1":{"id":"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2","symbol":"WETH"},"totalSupply":0,"trackedReserveETH":2.82e-16}],"uniswap_v3":[], "quickswap":[], "sushiswap":[]}';
  return allPoolsUnsanitizedJsonStr;
}

export async function getBSCPoolsByHttp(
  protocolSet: Set<BarterProtocol>,
  chainId: number
): Promise<string> {
  const request = assemblePoolRequest(protocolSet, chainId);
  const allPoolsUnsanitizedJsonStr =
    '{"pancakeswap":[{"id":"0x00004ee988665cdda9a1080d5792cecd16dc1220","reserveBNB":0.06180964849520753,"token0":{"id":"0x4d44d6c288b7f32ff676a4b2dafd625992f8ffbd","symbol":"SLC"},"token1":{"id":"0xdac17f958d2ee523a2206206994597c13d831ec7","symbol":"USDT"},"totalSupply":8.959536207295e-5,"trackedReserveBNB":0.06180964849520753},{"id":"0x0000871c95bb027c90089f4926fd1ba82cdd9a8b","reserveBNB":2.82e-16,"token0":{"id":"0x5152e1cb69a2ffa3997e89cbb4aba76a01d82141","symbol":"HORE"},"token1":{"id":"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2","symbol":"WETH"},"totalSupply":0,"trackedReserveBNB":2.82e-16}]}';
  return allPoolsUnsanitizedJsonStr;
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
  let request = barterServerUrl;
  let protocolArr = [];
  for (let protocol of protocolSet) {
    if (protocol === BarterProtocol.UNI_V2) {
      protocolArr.push('uniswap_v2');
    } else if (protocol === BarterProtocol.UNI_V3) {
      protocolArr.push('uniswap_v3');
    } else {
      protocolArr.push(protocol.toLowerCase());
    }
  }
  const protocolParam = protocolArr.join(',');
  request += 'getPair?protocols=' + protocolParam;
  request += '&&chainId=' + chainId;
  return request;
}
