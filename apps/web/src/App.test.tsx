import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { renderPage } from "./test/render";

describe("routing", () => {
  it("sends signed-out visitors to sign in", async () => {
    renderPage(<App />, { path: "*", route: "/progress", auth: { signedIn: false } });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/signin"));
  });

  it("sends password recovery links to the new password form", async () => {
    renderPage(<App />, { path: "*", route: "/", auth: { recovering: true } });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/update-password"));
  });

  it("shows the app shell when signed in", async () => {
    renderPage(<App />, { path: "*", route: "/" });
    expect((await screen.findAllByRole("navigation", { name: "Main" })).length).toBe(2);
  });
});
