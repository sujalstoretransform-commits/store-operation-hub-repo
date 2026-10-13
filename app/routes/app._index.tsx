import { useLoaderData, type HeadersFunction, type LoaderFunctionArgs, } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`#graphql
    query DashboardData {
      productsCount {
        count
      }
      openOrders: ordersCount(query: "status:open", limit: 10000) {
        count
      }
      unfulfilledOrders: ordersCount(
        query: "fulfillment_status:unfulfilled",
        limit: 10000
      ) {
        count
      }
      recentOrders: orders(
        first: 5,
        reverse: true,
        sortKey: CREATED_AT
      ) {
        nodes {
          name
          createdAt
          displayFulfillmentStatus
        }
      }
    }`)

  const result = await response.json()

  if (result.errors?.length) {
    throw new Response("Could not load dashboard data", { status: 502 });
  }

  return {
    productsCount: result.data.productsCount.count,
    openOrderCount: result.data.openOrders.count,
    unfulfilledOrderCount: result.data.unfulfilledOrders.count,
    recentOrders: result.data.recentOrders.nodes
  };
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();

  const stats = [
    { label: "Products", value: data.productsCount, detail: "In your catalog" },
    { label: "Open orders", value: data.openOrderCount, detail: "Currently open" },
    { label: "Unfulfilled", value: data.unfulfilledOrderCount, detail: "Awaiting fulfillment", },
    { label: "Low stock", value: "—", detail: "Inventory tools are next" },
  ];

  return (
    <s-page heading="Store Operations Hub">
      <style>{`
      .hub { display: grid; gap: 20px; max-width: 1100px; margin: 0 auto; }
      .intro { color: #616161; margin: 0; }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; }
      .card { background: white; border: 1px solid #e3e3e3; border-radius: 12px; padding: 20px; }
      .label { color: #616161; font-size: 14px; margin: 0 0 12px; }
      .value { font-size: 32px; font-weight: 650; margin: 0 0 6px; }
      .detail { color: #616161; font-size: 13px; margin: 0; }
      .section-title { font-size: 18px; margin: 0 0 16px; }
      .event { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-top: 1px solid #eee; }
      .event p { margin: 0; }
      .muted { color: #616161; font-size: 13px; }
    `}</style>


      <div className="hub">
        <p className="intro">A quick view of your store’s operations</p>

        <div className="stats">
          {stats.map((stat) => (
            <section className="card" key={stat.label}>
              <p className="label">{stat.label}</p>
              <p className="value">{stat.value}</p>
              <p className="detail">{stat.detail}</p>
            </section>
          ))}
        </div>

        <section className="card">
          <h2 className="section-title">Recent orders</h2>
          {data.recentOrders.length === 0 ? (
            <p className="muted">No record found</p>
          ) : (
            data.recentOrders.map((order: any) => (
              <div className="event" key={order.name}>
                <div>
                  <p><strong>{order.name}</strong></p>
                  <p className="muted">
                    Fulfillment: {order.displayFulfillmentStatus.toLowerCase()}
                  </p>
                </div>
                <span className="muted">{order.createdAt.slice(0, 10)}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </s-page>
  )
}

