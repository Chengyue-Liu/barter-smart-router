import { Pair as QPair } from '@davidwgrossman/quickswap-sdk';
import { Pair as PPair } from '@pancakeswap/sdk';
import { Percent } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { platform } from 'os';
import { CurrencyAmount } from '.';
import { RouteWithValidQuote } from '../routers/alpha-router';
import {
  PancakeV2Route,
  QuickV2Route,
  SushiV2Route,
  V2Route,
  V3Route,
} from '../routers/router';

export const pancakeRouteToString = (route: PancakeV2Route): string => {
  const routeStr = [];
  const tokens = route.path;
  const tokenPath = _.map(tokens, (token) => `${token.symbol}`);
  const pools = route.pairs;
  const poolFeePath = _.map(
    pools,
    (pool) =>
      `${
        pool instanceof Pool
          ? ` -- ${pool.fee / 10000}% [${Pool.getAddress(
              pool.token0,
              pool.token1,
              pool.fee
            )}]`
          : ` -- [${PPair.getAddress(
              (pool as PPair).token0,
              (pool as PPair).token1
            )}]`
      } --> `
  );

  for (let i = 0; i < tokenPath.length; i++) {
    routeStr.push(tokenPath[i]);
    if (i < poolFeePath.length) {
      routeStr.push(poolFeePath[i]);
    }
  }

  return routeStr.join('');
};

export const quickRouteToString = (route: QuickV2Route): string => {
  const routeStr = [];
  const tokens = route.path;
  const tokenPath = _.map(tokens, (token) => `${token.symbol}`);
  const pools = route.pairs;
  const poolFeePath = _.map(
    pools,
    (pool) =>
      `${
        pool instanceof Pool
          ? ` -- ${pool.fee / 10000}% [${Pool.getAddress(
              pool.token0,
              pool.token1,
              pool.fee
            )}]`
          : ` -- [${QPair.getAddress(
              (pool as QPair).token0,
              (pool as QPair).token1
            )}]`
      } --> `
  );

  for (let i = 0; i < tokenPath.length; i++) {
    routeStr.push(tokenPath[i]);
    if (i < poolFeePath.length) {
      routeStr.push(poolFeePath[i]);
    }
  }

  return routeStr.join('');
};

export const uniRouteToString = (
  route: V3Route | V2Route | SushiV2Route
): string => {
  const isV3Route = (
    route: V3Route | V2Route | SushiV2Route
  ): route is V3Route => (route as V3Route).pools != undefined;
  const routeStr = [];
  const tokens = isV3Route(route) ? route.tokenPath : route.path;
  const tokenPath = _.map(tokens, (token) => `${token.symbol}`);
  const pools = isV3Route(route) ? route.pools : route.pairs;
  const poolFeePath = _.map(
    pools,
    (pool) =>
      `${
        pool instanceof Pool
          ? ` -- ${pool.fee / 10000}% [${Pool.getAddress(
              pool.token0,
              pool.token1,
              pool.fee
            )}]`
          : ` -- [${Pair.getAddress(
              (pool as Pair).token0,
              (pool as Pair).token1
            )}]`
      } --> `
  );

  for (let i = 0; i < tokenPath.length; i++) {
    routeStr.push(tokenPath[i]);
    if (i < poolFeePath.length) {
      routeStr.push(poolFeePath[i]);
    }
  }

  return routeStr.join('');
};

export const routeAmountsToString = (
  routeAmounts: RouteWithValidQuote[]
): string => {
  const total = _.reduce(
    routeAmounts,
    (total: CurrencyAmount, cur: RouteWithValidQuote) => {
      return total.add(cur.amount);
    },
    CurrencyAmount.fromRawAmount(routeAmounts[0]!.amount.currency, 0)
  );

  const routeStrings = _.map(routeAmounts, ({ protocol, route, amount }) => {
    const portion = amount.divide(total);
    const percent = new Percent(portion.numerator, portion.denominator);
    return `[${platform} ${protocol}] ${percent.toFixed(2)}% = ${routeToString(
      route
    )}`;
  });

  return _.join(routeStrings, ', ');
};

export const routeAmountToString = (
  routeAmount: RouteWithValidQuote
): string => {
  const { route, amount } = routeAmount;
  return `${routeAmount.platform} ${amount.toExact()} = ${routeToString(
    route
  )}`;
};

export const poolToString = (p: Pool | Pair | PPair): string => {
  return `${p.token0.symbol}/${p.token1.symbol}${
    p instanceof Pool ? `/${p.fee / 10000}%` : ``
  }`;
};

export function routeToString(
  route: V2Route | V3Route | SushiV2Route | QuickV2Route | PancakeV2Route
): string {
  let routeStr = 'route type not found';
  if (route instanceof V2Route || route instanceof V3Route) {
    routeStr = uniRouteToString(route);
  } else if (route instanceof QuickV2Route) {
    routeStr = quickRouteToString(route);
  } else if (route instanceof PancakeV2Route) {
    routeStr = pancakeRouteToString(route);
  } else {
    routeStr = uniRouteToString(route);
  }
  return routeStr;
}
