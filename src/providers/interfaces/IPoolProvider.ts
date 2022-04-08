import { BigNumber } from 'ethers';
import { Token } from '../../util/token';
import { ProviderConfig } from '../provider';

/**
 * Provider for getting V2 pools.
 *
 * @export
 * @interface IV2PoolProvider
 */
export type IReserves = {
  reserve0: BigNumber;
  reserve1: BigNumber;
  blockTimestampLast: number;
};
export type V2PoolAccessor = {
  getPool: (tokenA: any, tokenB: any) => any | undefined;
  getPoolByAddress: (address: string) => any | undefined;
  getAllPools: () => any;
};

export interface IV2PoolProvider {
  /**
   * Gets the pools for the specified token pairs.
   *
   * @param tokenPairs The token pairs to get.
   * @param [providerConfig] The provider config.
   * @returns A pool accessor with methods for accessing the pools.
   */
  getPools(
    tokenPairs: [Token, Token][],
    providerConfig?: ProviderConfig
  ): Promise<V2PoolAccessor>;

  /**
   * Gets the pool address for the specified token pair.
   *
   * @param tokenA Token A in the pool.
   * @param tokenB Token B in the pool.
   * @returns The pool address and the two tokens.
   */
  getPoolAddress(
    tokenA: Token,
    tokenB: Token
  ): { poolAddress: string; token0: Token; token1: Token };
}
