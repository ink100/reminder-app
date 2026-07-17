import { MedicineDetail } from "@/components/medicines/medicine-detail";

export default async function MedicineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MedicineDetail id={id} />;
}
