import {
  CurrencyAmount as QCurrencyAmount,
  Pair as QPair,
  Route as QRoute,
  Token as QToken,
  TokenAmount,
} from '@davidwgrossman/quickswap-sdk';
import { Token as UToken } from '@uniswap/sdk-core';
import { Pair as UPair } from '@uniswap/v2-sdk';
import JSBI from 'jsbi';
import { wrappedCurrency } from '../providers/quickswap/v2/quote-provider';
import { QuickV2Route, V2Route } from '../routers';
import { CurrencyAmount as UCurrencyAmount } from '../util/amounts';
export function uniTokenToQuickToken(token: UToken): QToken {
  return new QToken(
    token.chainId,
    token.address,
    token.decimals,
    token.symbol,
    token.name
  );
}

export function uniTokenArrToQuickTokenArr(tokens: UToken[]): QToken[] {
  let qTokens: QToken[] = [];
  for (let token of tokens) {
    qTokens.push(uniTokenToQuickToken(token));
  }
  return qTokens;
}

export function quickTokenToUniToken(token: QToken): UToken {
  return new UToken(
    token.chainId,
    token.address,
    token.decimals,
    token.symbol,
    token.name
  );
}

export function uniTokenPairToQuickTokenPairs(
  tokenPairs: [UToken, UToken][]
): [QToken, QToken][] {
  let qTokenPairs: [QToken, QToken][] = [];
  for (const tokenPair of tokenPairs) {
    qTokenPairs.push([
      uniTokenToQuickToken(tokenPair[0]),
      uniTokenToQuickToken(tokenPair[1]),
    ]);
  }
  return qTokenPairs;
}

export function toQuickCurrencyAmount(
  amount: UCurrencyAmount
): QCurrencyAmount {
  const value = JSBI.divide(amount.numerator, amount.denominator);

  return new TokenAmount(
    uniTokenToQuickToken(amount.currency.wrapped),
    value.toString()
  );
}

export function quickToUniCurrencyAmount(
  amount: QCurrencyAmount
): UCurrencyAmount {
  return UCurrencyAmount.fromRawAmount(
    quickTokenToUniToken(wrappedCurrency(amount.currency, 137)),
    amount.numerator
  );
}

export function toQuickCurrencyAmountArr(
  amounts: UCurrencyAmount[]
): QCurrencyAmount[] {
  let qAmounts = [];
  for (const amount of amounts) {
    qAmounts.push(toQuickCurrencyAmount(amount));
  }
  return qAmounts;
}

// export function uniPriceToQuickPrice(price: UPrice<Currency, Currency>): QPrice {
//     new QPrice(toQuickCu);
// }
export function toQuickRouteArr(routes: V2Route[]): QuickV2Route[] {
  const qRoutes: QuickV2Route[] = [];
  for (let route of routes) {
    qRoutes.push(toQuickRoute(route));
  }
  return qRoutes;
}

export function toQuickPairArr(pairs: UPair[]): QPair[] {
  let qPair = [];
  for (let pair of pairs) {
    qPair.push(toQuickPair(pair));
  }
  return qPair;
}

export function toQuickPair(pair: UPair): QPair {
  const tokenAmountA: TokenAmount = new TokenAmount(
    uniTokenToQuickToken(pair.token0),
    pair.reserve0.numerator
  );
  const tokenAmountB: TokenAmount = new TokenAmount(
    uniTokenToQuickToken(pair.token1),
    pair.reserve1.numerator
  );
  return new QPair(tokenAmountA, tokenAmountB);
}

export function toQuickRoute(route: V2Route): QuickV2Route {
  return new QRoute(
    toQuickPairArr(route.pairs),
    new QToken(
      route.input.chainId,
      route.input.address,
      route.input.decimals,
      route.input.symbol,
      route.input.name
    ),
    new QToken(
      route.output.chainId,
      route.output.address,
      route.output.decimals,
      route.output.symbol,
      route.output.name
    )
  );
}
