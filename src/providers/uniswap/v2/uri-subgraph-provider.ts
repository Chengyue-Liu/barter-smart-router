import {
  IV2SubgraphProvider,
  V2SubgraphPool,
} from '../../interfaces/ISubgraphProvider';
import { URISubgraphProvider } from '../../uri-subgraph-provider';

export class V2URISubgraphProvider
  extends URISubgraphProvider<V2SubgraphPool>
  implements IV2SubgraphProvider {}
