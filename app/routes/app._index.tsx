import { useLoaderData, type HeadersFunction, type LoaderFunctionArgs, type ActionFunctionArgs, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "app/db.server";
import { logActivity } from "app/utils/activity-log.server";

const LOW_STOCK_THRESHOLD = 5

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`#graphql
    query DashboardData {
      productsCount {
        count
      }

      lowStockCount: productsCount(query: "inventory_total:<=5") {
        count
      }

      lowStockProducts: products(
        first: 5
        query: "inventory_total:<=5"
        sortKey: INVENTORY_TOTAL
      ) {
        nodes {
          id
          title
          handle
          totalInventory
        }
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

  if (!response.ok || result.errors?.length || !result.data) {
    console.error("Dashboard GraphQL errors:", result.errors);
    throw new Response("Could not load dashboard data", {
      status: 502,
    });
  }

  return {
    productsCount: result.data.productsCount.count,
    lowStockCount: result.data.lowStockCount.count,
    lowStockProducts: result.data.lowStockProducts.nodes,
    openOrderCount: result.data.openOrders.count,
    unfulfilledOrderCount: result.data.unfulfilledOrders.count,
    recentOrders: result.data.recentOrders.nodes
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request)
  const formData = await request.formData()

  const productId = String(formData.get("productId") ?? "");
  const productTitle = String(formData.get("productTitle") ?? "").trim();

  if (
    !productId.startsWith("gid://shopify/Product/") ||
    !productTitle
  ) {
    return { ok: false, message: "Invalid product details." };
  }

  const response = await admin.graphql(
    `#graphql
      query VerifyProduct($id: ID!) {
        product(id: $id) {
          id
          title
        }
      }
    `,
    { variables: { id: productId } }
  );

  if (!response.ok) {
    return { ok: false, message: "Could not verify the product." };
  }

  const result = await response.json();

  const product = result.data?.product

  if (!product) {
    return { ok: false, message: "Product not found." };
  }

  try {
    await prisma.lowStockAlertReview.upsert({
      where: {
        shop_productId: {
          shop: session.shop,
          productId
        },
      },
      create: {
        shop: session.shop,
        productId,
        productTitle: product.title
      },
      update: {
        productTitle: product.title,
        reviewedAt: new Date()
      }
    })

    await logActivity({
      shop: session.shop,
      action: "LOW_STOCK_ALERT_REVIEWED",
      description: `Reviewed low-stock alert for ${product.title}`,
      resourceType: "Product",
      resourceId: productId,
      resourceName: product.title
    })

    return { ok: true, message: "Alert marked as reviewed." };
  } catch (error) {
    console.error("Failed to save low-stock review:", error);
    return { ok: false, message: "Could not save the review." };
  }

}

const LowStockReviewButton = ({ product }: { product: { id: string, title: string } }) => {
  const fetcher = useFetcher<typeof action>();

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="productTitle" value={product.title} />
      <button
        type="submit"
        disabled={fetcher.state !== "idle"}
      >
        {fetcher.state !== "idle" ? "Saving..." : "Mark as reviewed"}
      </button>

      {fetcher.data?.ok === true && (
        <p>Reviewed successfully.</p>
      )}

      {fetcher.data?.ok === false && (
        <p role="alert">{fetcher.data.message}</p>
      )}
    </fetcher.Form>
  )
}

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
      .stock-warning { color: #9a3412; font-weight: 600; }
      .section-link { display: inline-block; margin-top: 16px; }
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
          <h2 className="section-title">Operational alerts</h2>
          {data.lowStockCount === 0 ? (
            <p className="muted">
              No low-stock products found. Your tracked inventory is looking good.
            </p>
          ) : (
            <>
              <p className="muted">
                {data.lowStockCount} products have total inventory of {LOW_STOCK_THRESHOLD} units or fewer.
              </p>

              {data.lowStockProducts.map((product: any) => (
                <div className="event" key={product.id}>
                  <div>
                    <p><strong>{product.tile}</strong></p>
                    <p className="muted">{product.handle}</p>
                    <span className="stock-warning">{product.totalInventory ?? 0} units</span>
                  </div>

                  <LowStockReviewButton product={product} />
                </div>

              ))}

              {data.lowStockCount > data.lowStockProducts.length && (
                <p className="muted">
                  Showing the first {data.lowStockProducts.length} products.
                </p>
              )}
            </>
          )}
          <a href="/app/products" className="section-link">View inventory</a>
        </section>

        <section className="card">
          <h2 className="section-title">Recent orders</h2>
          {data.recentOrders.length === 0 ? (
            <p className="muted">No record found</p>
          ) : (
            data.recentOrders.map((order: {
              name: string,
              createdAt: string,
              displayFulfillmentStatus: string
            }) => (
              <div className="event" key={order.name}>
                <div>
                  <p><strong>{order.name}</strong></p>
                  <p className="muted">
                    Fulfillment: {" "}
                    {order.displayFulfillmentStatus.toLowerCase()}
                  </p>
                </div>
                <span className="muted">
                  {order.createdAt.slice(0, 10)}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </s-page>
  )
}

