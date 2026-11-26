import { redirect } from "react-router";

// Support Messages became Client Messages (threaded conversations); old links land on the new inbox.
export function clientLoader() {
  return redirect("/client-messages");
}

export default function Redirect() {
  return null;
}
