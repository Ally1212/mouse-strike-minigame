import { bootstrap } from "./app/bootstrap.js";

bootstrap().catch((error) => {
  console.error("Mouse Strike bootstrap failed", error);
});
