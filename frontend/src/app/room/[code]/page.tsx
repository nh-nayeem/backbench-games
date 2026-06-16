import { RoomClient } from "./room-client";

export const dynamic = "force-dynamic";

type RoomPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { code } = await params;

  return <RoomClient code={code.toUpperCase()} />;
}
