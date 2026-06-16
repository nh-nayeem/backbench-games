import { PlayClient } from "./play-client";

export const dynamic = "force-dynamic";

type PlayPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function PlayPage({ params }: PlayPageProps) {
  const { code } = await params;

  return <PlayClient code={code.toUpperCase()} />;
}
