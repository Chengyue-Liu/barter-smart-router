import {
  CurrencyAmount as SushiCurrencyAmountRaw,
  Pair as SPair,
  Route as SRoute,
  Token as SToken,
} from '@sushiswap/sdk';
import { Token as UToken } from '@uniswap/sdk-core';
import { Pair as UPair } from '@uniswap/v2-sdk';
import { SushiV2Route, V2Route } from '../routers';
import {
  CurrencyAmount as UCurrencyAmount,
  SushiCurrencyAmount,
} from '../util/amounts';

export function uniTokenToSushiToken(token: UToken): SToken {
  return new SToken(
    token.chainId,
    token.address,
    token.decimals,
    token.symbol,
    token.name
  );
}

export function uniTokenArrToSushiTokenArr(tokens: UToken[]): SToken[] {
  let qTokens: SToken[] = [];
  for (let token of tokens) {
    qTokens.push(uniTokenToSushiToken(token));
  }
  return qTokens;
}

export function sushiTokenToUniToken(token: SToken): UToken {
  return new UToken(
    token.chainId,
    token.address,
    token.decimals,
    token.symbol,
    token.name
  );
}

export function uniTokenPairToSushiTokenPairs(
  tokenPairs: [UToken, UToken][]
): [SToken, SToken][] {
  let qTokenPairs: [SToken, SToken][] = [];
  for (const tokenPair of tokenPairs) {
    qTokenPairs.push([
      uniTokenToSushiToken(tokenPair[0]),
      uniTokenToSushiToken(tokenPair[1]),
    ]);
  }
  return qTokenPairs;
}

export function toSushiCurrencyAmount(
  amount: UCurrencyAmount
): SushiCurrencyAmount {
  return SushiCurrencyAmount.fromFractionalAmount(
    uniTokenToSushiToken(amount.currency.wrapped),
    amount.numerator.toString(),
    amount.denominator.toString()
  );
}

export function sushiToUniCurrencyAmount(
  amount: SushiCurrencyAmount
): UCurrencyAmount {
  return UCurrencyAmount.fromFractionalAmount(
    amount.currency,
    amount.numerator.toString(),
    amount.denominator.toString()
  );
}

export function toSushiCurrencyAmountArr(
  amounts: UCurrencyAmount[]
): SushiCurrencyAmount[] {
  let qAmounts = [];
  for (const amount of amounts) {
    qAmounts.push(toSushiCurrencyAmount(amount));
  }
  return qAmounts;
}

export function toSushiRouteArr(routes: V2Route[]): SushiV2Route[] {
  const sRoutes: SushiV2Route[] = [];
  for (let route of routes) {
    sRoutes.push(toSushiRoute(route));
  }
  return sRoutes;
}

export function toSushiPairArr(pairs: UPair[]): SPair[] {
  let sPair = [];
  for (let pair of pairs) {
    sPair.push(toSushiPair(pair));
  }
  return sPair;
}

export function toSushiPair(pair: UPair): SPair {
  const tokenAmountA: SushiCurrencyAmountRaw<SToken> =
    SushiCurrencyAmount.fromRawAmount(
      uniTokenToSushiToken(pair.token0),
      pair.reserve0.numerator.toString()
    );
  const tokenAmountB: SushiCurrencyAmountRaw<SToken> =
    SushiCurrencyAmount.fromRawAmount(
      uniTokenToSushiToken(pair.token1),
      pair.reserve1.numerator.toString()
    );
  return new SPair(tokenAmountA, tokenAmountB);
}

export function toSushiRoute(route: V2Route): SushiV2Route {
  return new SRoute(
    toSushiPairArr(route.pairs),
    new SToken(
      route.input.chainId,
      route.input.address,
      route.input.decimals,
      route.input.symbol,
      route.input.name
    ),
    new SToken(
      route.output.chainId,
      route.output.address,
      route.output.decimals,
      route.output.symbol,
      route.output.name
    )
  );
}
