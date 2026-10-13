import {
    useFetcher,
    useLoaderData,
    type HeadersFunction,
    type LoaderFunctionArgs,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const LOW_STOCK_THRESHOLD = 5;

type StockFilter = "all" | "low" | "out" | "in";

type Product = {
    id: string;
    title: string;
    handle: string;
    status: string;
    totalInventory: number | null;
    tracksInventory: boolean;
};

type ProductsGraphQLResponse = {
    data?: {
        products?: {
            nodes: Product[];
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
        };
    };
    errors?: { message: string }[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("q")?.trim() ?? "";
    const after = url.searchParams.get("after") || null;

    const requestedStock = url.searchParams.get("stock") ?? "all";
    const stock: StockFilter = ["all", "low", "out", "in"]
        .includes(requestedStock) ? (requestedStock as StockFilter) : "all"

    const stockQueries: Record<StockFilter, string> = {
        all: "",
        low: `inventory_total:>0 AND inventory_total:<=${LOW_STOCK_THRESHOLD}`,
        out: "inventory_total:0",
        in: "inventory_total:>5"
    }

    const searchQuery = [
        search,
        stockQueries[stock]
    ].filter(Boolean).join(" AND ")

    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(
        `#graphql
      query ProductsPage($first: Int!, $after: String, $query: String) {
        products(
          first: $first
          after: $after
          query: $query
          sortKey: TITLE
        ) {
          nodes {
            id
            title
            handle
            status
            totalInventory
            tracksInventory
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
        {
            variables: {
                first: 25,
                after,
                query: searchQuery || null,
            },
        },
    );

    if (!response.ok) {
        throw new Response("Could not load products", { status: 502 });
    }

    const result = (await response.json()) as ProductsGraphQLResponse;

    if (result.errors?.length || !result.data?.products) {
        console.error("Products GraphQL errors:", result.errors);
        throw new Response("Could not load products", { status: 502 });
    }

    return {
        products: result.data.products.nodes,
        pageInfo: result.data.products.pageInfo,
        search,
        stock,
        lowStockThreshold: LOW_STOCK_THRESHOLD,
    };
};

export const headers: HeadersFunction = (args) => boundary.headers(args);

export default function ProductsPage() {
    const initialData = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof loader>();
    const searching = fetcher.state !== "idle"

    const { products, pageInfo, search, stock, lowStockThreshold } = fetcher.data ?? initialData

    const nextParams = new URLSearchParams();
    if (search) nextParams.set("q", search);
    if (stock !== "all") nextParams.set("stock", stock);
    if (pageInfo.endCursor) nextParams.set("after", pageInfo.endCursor);

    return (
        <s-page heading="Products & inventory">
            <style>{`
        .products {
          display: grid;
          gap: 16px;
          max-width: 1100px;
          margin: 0 auto;
        }

        .toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .search {
          flex: 1;
          min-width: 180px;
          padding: 10px 12px;
          border: 1px solid #8a8a8a;
          border-radius: 8px;
        }

        .filter, .button {
          padding: 10px 12px;
          border: 1px solid #8a8a8a;
          border-radius: 8px;
          background: white;
          color: #202223;
        }

        .button {
          cursor: pointer;
          text-decoration: none;
        }

        .button:disabled {
          cursor: wait;
          opacity: .6;
        }

        .card {
          overflow-x: auto;
          background: white;
          border: 1px solid #e3e3e3;
          border-radius: 12px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        th, td {
          padding: 14px 18px;
          border-bottom: 1px solid #eee;
        }

        th {
          color: #616161;
          font-size: 13px;
        }

        .status {
          text-transform: capitalize;
        }

        .muted {
          color: #616161;
        }

        .badge {
          display: inline-block;
          padding: 4px 9px;
          border-radius: 999px;
          font-size: 12px;
          white-space: nowrap;
        }

        .stock-ok {
          background: #e3f1df;
          color: #1f6011;
        }

        .stock-low {
          background: #fff1cc;
          color: #704b00;
        }

        .stock-out {
          background: #ffe4e4;
          color: #8e1f1f;
        }

        .stock-untracked {
          background: #f1f1f1;
          color: #616161;
        }

        .pagination {
          display: flex;
          justify-content: flex-end;
        }
      `}</style>

            <div className="products">
                <p className="muted">
                    Low stock means {lowStockThreshold} units or fewer.
                    Products with inventory tracking disabled are marked
                    as not tracked.
                </p>
                <fetcher.Form method="get" className="toolbar">
                    <input
                        className="search"
                        type="search"
                        name="q"
                        key={search}
                        defaultValue={search}
                        placeholder="Search products"
                        aria-label="Search products"
                    />
                    <select
                        className="filter"
                        name="stock"
                        key={stock}
                        defaultValue={stock}
                        aria-label="Filter by inventory"
                    >
                        <option value="all">All inventory</option>
                        <option value="low">Low stock</option>
                        <option value="out">Out of stock</option>
                        <option value="in">In stock</option>
                    </select>
                    <button
                        className="button"
                        type="submit"
                        disabled={searching}
                    >
                        {searching ? "Searching..." : "Search"}
                    </button>
                </fetcher.Form>

                <div className="card">
                    {products.length === 0 ? (
                        <p className="muted" style={{ padding: 18 }}>
                            No products match these filters.
                        </p>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Status</th>
                                    <th>Inventory</th>
                                    <th>Stock health</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product) => {
                                    const inventory = product.totalInventory ?? 0;

                                    const health = !product.tracksInventory
                                        ? {
                                            label: "Not tracked",
                                            className: "stock-untracked",
                                        }
                                        : inventory <= 0
                                            ? {
                                                label: "Out of stock",
                                                className: "stock-out",
                                            }
                                            : inventory <= lowStockThreshold
                                                ? {
                                                    label: "Low stock",
                                                    className: "stock-low",
                                                }
                                                : {
                                                    label: "In stock",
                                                    className: "stock-ok",
                                                };
                                                
                                    return (
                                        <tr key={product.id}>
                                            <td>
                                                <strong>{product.title}</strong>
                                                <div className="muted">/{product.handle}</div>
                                            </td>
                                            <td className="status">
                                                {product.status.toLowerCase()}
                                            </td>
                                            <td>
                                                {product.tracksInventory
                                                    ? inventory.toLocaleString()
                                                    : "—"}
                                            </td>
                                            <td>
                                                <span className={`badge ${health.className}`}>
                                                    {health.label}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {pageInfo.hasNextPage && (
                    <div className="pagination">
                        <a className="button" href={`/app/products?${nextParams.toString()}`}>
                            Next page
                        </a>
                    </div>
                )}
            </div>
        </s-page>
    );
}