import VisitorChat from "./visitor-chat";

export const dynamic = "force-dynamic";

export default async function PublicChatPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const isDemoBusiness = businessSlug === "northstar-fitness";

  return (
    <VisitorChat
      businessName={isDemoBusiness ? "Northstar Fitness" : undefined}
      businessSlug={businessSlug}
      isDemoBusiness={isDemoBusiness}
    />
  );
}
