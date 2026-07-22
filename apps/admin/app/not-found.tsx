import Link from "next/link";

import { AdminMessage } from "@/components/AdminMessage";

export default function NotFound() {
  return (
    <AdminMessage
      kicker="404"
      title="Page not found"
      body="That page doesn't exist in the dashboard."
    >
      <Link className="btnPrimary" href="/">
        Back to dashboard
      </Link>
    </AdminMessage>
  );
}
