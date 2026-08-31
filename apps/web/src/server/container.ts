import { Env } from "~/env.js";
import { Container } from "./import.js";

// One per process, at module scope. Never per request: constructing per request opens
// a connection pool per request, which exhausts Postgres in about four seconds under
// load. Count pools across replicas, not per process — forty instances at ten
// connections is four hundred against a default `max_connections` of a hundred.
export const container = new Container(Env.containerConfig());
