import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { syncMakerichInventoryWatches } from "@/lib/inventory-service";

async function main() {
  const items = await syncMakerichInventoryWatches();
  console.log(`synced makerich inventory: ${items.length} canonical products`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
