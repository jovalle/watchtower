import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AppLayout, { ErrorBoundary } from "~/routes/app";
vi.mock("@remix-run/react", async () => await import("react-router-dom"));
beforeEach(() => { vi.stubGlobal("matchMedia", () => ({matches:false,addEventListener(){},removeEventListener(){}})); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ sessions: [] }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("retains the validated app header when a child route fails", async () => {
  const router = createMemoryRouter([
    {id:"routes/app", path:"/app", element:<AppLayout/>, errorElement:<ErrorBoundary/>, loader:()=>({ user:{id:1,username:"Tester",title:"Tester"}, discoveryDisabled:false }),children:[{path:"broken",element:<p>Unreachable</p>,loader:()=>{throw new Response("Missing",{status:404});}}]},
    {path:"/api/notifications",loader:()=>({unread:0})},
  ], {initialEntries:["/app/broken"]});
  render(<RouterProvider router={router}/>);
  expect(await screen.findByRole("heading",{name:"Page Not Found"})).toBeVisible();
  expect(screen.getByRole("link",{name:"Watchtower Home"})).toBeVisible();
});
it("does not render authenticated navigation after a failed parent loader", async () => {
  const router = createMemoryRouter([{id:"routes/app",path:"/app",element:<AppLayout/>,errorElement:<ErrorBoundary/>,loader:()=>{throw new Error("unavailable");}}],{initialEntries:["/app"]});
  render(<RouterProvider router={router}/>);
  expect(await screen.findByRole("heading",{name:"Something Went Wrong"})).toBeVisible();
  expect(screen.queryByRole("link",{name:"Watchtower Home"})).toBeNull();
});
it("removes covered browse controls from fullscreen playback", async () => {
  const router = createMemoryRouter([{id:"routes/app",path:"/app",element:<AppLayout/>,loader:()=>({user:{id:1,username:"Tester"},discoveryDisabled:false}),children:[{
    id:"routes/app.watch.$ratingKey",path:"watch/:ratingKey",element:<div data-player-page><button>Player Back</button></div>,
  }]}],{initialEntries:["/app/watch/42"]});
  render(<RouterProvider router={router}/>);
  expect(await screen.findByRole("button",{name:"Player Back"})).toBeVisible();
  expect(screen.queryByRole("link",{name:"Watchtower Home"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Open Menu"})).toBeNull();
});
