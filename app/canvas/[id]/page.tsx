import CanvasClient from "@/components/CanvasClient";

export default async function CanvasPage({ params }: PageProps<"/canvas/[id]">) {
  const { id } = await params;
  return <CanvasClient canvasId={id} />;
}
