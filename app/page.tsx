import StorybookLoginDialog from "@/features/auth/components/storybook-login-dialog";
import Storybook from "@/features/storybook/components/storybook";

export default function Home() {
  return <Storybook login={<StorybookLoginDialog />} />;
}
