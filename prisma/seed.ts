async function main() {
  // AppSetting moved to Supabase. Do not recreate it in the legacy SQLite database.
  console.log("No SQLite seed data is required.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
