import {
  CurrencyAmount,
  Pair,
  Route,
  Token,
  TokenAmount,
} from '@pancakeswap/sdk';
import {
  CurrencyAmount as UCurrencyAmountRaw,
  Token as UToken,
} from '@uniswap/sdk-core';
import { Pair as UPair } from '@uniswap/v2-sdk';
import JSBI from 'jsbi';
import { wrappedCurrency } from '../providers/pancakeswap/v2/quote-provider';
import { PancakeV2Route, V2Route } from '../routers';
import { CurrencyAmount as UCurrencyAmount } from '../util/amounts';

export function uniTokenToPancakeToken(token: UToken): Token {
  return new Token(
    token.chainId,
    token.address,
    token.decimals,
    token.symbol,
    token.name
  );
}

export function uniTokenArrToPancakeTokenArr(tokens: UToken[]): Token[] {
  let Tokens: Token[] = [];
  for (let token of tokens) {
    Tokens.push(uniTokenToPancakeToken(token));
  }
  return Tokens;
}

export function pancakeTokenToUniToken(token: Token): UToken {
  return new UToken(
    token.chainId,
    token.address,
    token.decimals,
    token.symbol,
    token.name
  );
}
export function pancakeTokensToUniTokens(tokens: Token[]): UToken[] {
  let uTokens: UToken[] = [];
  for (const token of tokens) {
    uTokens.push(pancakeTokenToUniToken(token));
  }
  return uTokens;
}

export function uniTokenPairToPancakeTokenPairs(
  tokenPairs: [UToken, UToken][]
): [Token, Token][] {
  let TokenPairs: [Token, Token][] = [];
  for (const tokenPair of tokenPairs) {
    TokenPairs.push([
      uniTokenToPancakeToken(tokenPair[0]),
      uniTokenToPancakeToken(tokenPair[1]),
    ]);
  }
  return TokenPairs;
}

export function toPancakeCurrencyAmount(
  amount: UCurrencyAmount
): CurrencyAmount {
  const value = JSBI.divide(amount.numerator, amount.denominator);
  return new TokenAmount(
    uniTokenToPancakeToken(amount.currency.wrapped),
    value.toString()
  );
}

export function pancakeToUniCurrencyAmount(
  amount: CurrencyAmount
): UCurrencyAmount {
  return UCurrencyAmount.fromRawAmount(
    pancakeTokenToUniToken(wrappedCurrency(amount.currency, 56)),
    amount.numerator
  );
}

export function toPancakeCurrencyAmountArr(
  amounts: UCurrencyAmount[]
): CurrencyAmount[] {
  let qAmounts = [];
  for (const amount of amounts) {
    qAmounts.push(toPancakeCurrencyAmount(amount));
  }
  return qAmounts;
}

// export function uniPriceToPancakePrice(price: UPrice<Currency, Currency>): QPrice {
//     new QPrice(toPancakeCu);
// }
export function toPancakeRouteArr(routes: V2Route[]): PancakeV2Route[] {
  const qRoutes: PancakeV2Route[] = [];
  for (let route of routes) {
    qRoutes.push(toPancakeRoute(route));
  }
  return qRoutes;
}

export function toPancakePairArr(pairs: UPair[]): Pair[] {
  let qPair = [];
  for (let pair of pairs) {
    qPair.push(toPancakePair(pair));
  }
  return qPair;
}

export function toPancakePair(pair: UPair): Pair {
  const tokenAmountA: TokenAmount = new TokenAmount(
    uniTokenToPancakeToken(pair.token0),
    pair.reserve0.numerator
  );
  const tokenAmountB: TokenAmount = new TokenAmount(
    uniTokenToPancakeToken(pair.token1),
    pair.reserve1.numerator
  );
  return new Pair(tokenAmountA, tokenAmountB);
}

export function toUniPair(pair: Pair): UPair {
  const tokenAmountA: UCurrencyAmountRaw<UToken> =
    UCurrencyAmountRaw.fromRawAmount(
      pancakeTokenToUniToken(pair.token0),
      pair.reserve0.numerator.toString()
    );
  const tokenAmountB: UCurrencyAmountRaw<UToken> =
    UCurrencyAmountRaw.fromRawAmount(
      pancakeTokenToUniToken(pair.token1),
      pair.reserve1.numerator.toString()
    );
  return new UPair(tokenAmountA, tokenAmountB);
}
export function toUniPairArr(pairs: Pair[]): UPair[] {
  let uPair = [];
  for (let pair of pairs) {
    uPair.push(toUniPair(pair));
  }
  return uPair;
}

export function toPancakeRoute(route: V2Route): PancakeV2Route {
  return new Route(
    toPancakePairArr(route.pairs),
    new Token(
      route.input.chainId,
      route.input.address,
      route.input.decimals,
      route.input.symbol,
      route.input.name
    ),
    new Token(
      route.output.chainId,
      route.output.address,
      route.output.decimals,
      route.output.symbol,
      route.output.name
    )
  );
}
