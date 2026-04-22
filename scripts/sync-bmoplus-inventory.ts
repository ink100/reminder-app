import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { syncBmoplusInventoryWatches } from "@/lib/inventory-service";

async function main() {
  const items = await syncBmoplusInventoryWatches();
  console.log(`synced bmoplus inventory: ${items.length} canonical products`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
