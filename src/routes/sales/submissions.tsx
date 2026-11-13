import { redirect } from "react-router";

export function clientLoader() {
  return redirect("/deals");
}

export default function Redirect() {
  return null;
}
