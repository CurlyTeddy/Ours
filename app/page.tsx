import StorybookLoginDialog from "@/features/auth/components/storybook-login-dialog";
import Storybook from "@/features/storybook/components/storybook";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <Storybook
      login={
        <StorybookLoginDialog
          callbackUrl={
            typeof callbackUrl === "string" ? callbackUrl : undefined
          }
        />
      }
    />
  );
}
