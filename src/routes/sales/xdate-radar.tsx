import { redirect } from "react-router";

export function clientLoader() {
  return redirect("/deals?expiry=120");
}

export default function Redirect() {
  return null;
}
