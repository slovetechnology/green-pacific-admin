import { redirect } from "react-router";

// Contact Us became Messages; old links and bookmarks land there.
export function clientLoader() {
  return redirect("/portal/messages");
}

export default function Redirect() {
  return null;
}
