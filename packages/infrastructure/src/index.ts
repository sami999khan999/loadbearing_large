import { ServerOnly } from "./import.js";

ServerOnly.assert("@loadbearing/infrastructure");

export { type OpenAiEmbeddingConfig, OpenAiEmbeddingProvider } from "./embedding/index.js";
