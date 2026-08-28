import { ServerOnly } from "./import.js";

ServerOnly.assert("@loadbearing/composition");

export { Container, type ContainerConfig, type HealthReport } from "./container/index.js";
