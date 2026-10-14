import { useFetcher, useLoaderData, type LoaderFunctionArgs, } from "react-router";
import { authenticate } from "../shopify.server";
import { useEffect, useState } from "react";

const ORDERS_QUERY = `#graphql
    query OrdersPage(
        $first: Int
        $after: String
        $last: Int,
        $before: String,
        $query: String
    ) {
      orders (
        first: $first
        after: $after
        last: $last,
        before: $before,
        query: $query,
        sortKey: CREATED_AT,
        reverse: true
      ) {
        nodes {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            totalPriceSet {
                shopMoney {
                    amount
                    currencyCode
                }
            }
            customer {
                displayName
                email
            }
        }
        pageInfo {
            hasNextPage
            hasPreviousPage
            endCursor
            startCursor
        }
    }
}`

type Order = {
    id: string;
    name: string;
    createdAt: string;
    displayFinancialStatus: string | null;
    displayFulfillmentStatus: string | null;
    totalPriceSet: {
        shopMoney: {
            amount: string;
            currencyCode: string;
        };
    };
    customer: {
        displayName: string;
        email: string | null;
    } | null;
};

type OrdersResponse = {
    data?: {
        orders: {
            nodes: Order[];
            pageInfo: {
                hasNextPage: boolean;
                hasPreviousPage: boolean;
                endCursor: string | null;
                startCursor: string | null;
            };
        };
    };
    errors?: { message: string }[];
};

function buildOrderQuery(
    search: string,
    payment: string,
    fulfillment: string
) {
    const parts: string[] = [];

    if (search) {
        const safeSearch = search.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        parts.push(
            `(name:*${safeSearch}* OR email:*${safeSearch}*)`,
        );
    }

    if (payment !== "all") {
        const financialStatus: Record<string, string> = {
            paid: "financial_status:paid",
            pending: "financial_status:pending",
            refunded: "financial_status:refunded",
            partially_refunded: "financial_status:partially_refunded",
            authorized: "financial_status:authorized",
            partially_paid: "financial_status:partially_paid",
            unpaid: "financial_status:unpaid",
        }

        if (financialStatus[payment]) {
            parts.push(financialStatus[payment])
        }
    }

    if (fulfillment !== "all") {
        const fulfillmentStatus: Record<string, string> = {
            fulfilled: "fulfillment_status:fulfilled",
            unfulfilled: "fulfillment_status:unfulfilled",
            partial: "fulfillment_status:partial",
            scheduled: "fulfillment_status:scheduled",
            on_hold: "fulfillment_status:on_hold",
        };

        if (fulfillmentStatus[fulfillment]) {
            parts.push(fulfillmentStatus[fulfillment])
        }
    }

    return parts.join(" AND ")
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);

    const search = url.searchParams.get("q")?.trim() ?? "";
    const payment = url.searchParams.get("payment") ?? "all";
    const fulfillment = url.searchParams.get("fulfillment") ?? "all";
    const before = url.searchParams.get("before") || null;
    const after = url.searchParams.get("after") || null;

    const allowedPayments = [
        "all",
        "paid",
        "pending",
        "refunded",
        "partially_refunded",
        "authorized",
        "partially_paid",
        "unpaid",
    ];

    const allowedFulfillment = [
        "all",
        "fulfilled",
        "unfulfilled",
        "partial",
        "scheduled",
        "on_hold",
    ];

    const safePayment = allowedPayments.includes(payment)
        ? payment
        : "all";

    const safeFulfillment = allowedFulfillment.includes(fulfillment)
        ? fulfillment
        : "all";

    const query = buildOrderQuery(
        search,
        safePayment,
        safeFulfillment
    )

    const variables = before
        ? { first: null, after: null, last: 25, before, query: query || null }
        : { first: 25, after, last: null, before: null, query: query || null }

    const { admin } = await authenticate.admin(request);

    const response = await admin.graphql(ORDERS_QUERY, {
        variables,
    })

    if (!response.ok) {
        throw new Response("Could not load orders", { status: 502 });
    }

    const result = (await response.json()) as OrdersResponse

    if (result.errors?.length || !result.data?.orders) {
        console.error("Orders GraphQL errors:", result.errors);
        throw new Response("Could not load orders", { status: 502 });
    }

    return {
        orders: result.data.orders.nodes,
        pageInfo: result.data.orders.pageInfo,
        search,
        payment: safePayment,
        fulfillment: safeFulfillment
    };
};

const statusLable = (status: string | null | undefined) => {
    if (!status) return "Unknown"

    return status
        .toLowerCase()
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
}

const statusClass = (status: string | null | undefined) => {
    const normalized = status?.toLowerCase() ?? "";

    if (["paid", "fulfilled"].includes(normalized)) {
        return "status-success";
    }
    else if (
        ["refunded", "voided", "unfulfilled"].includes(normalized)
    ) {
        return "status-warning";
    }
    else {
        return "status-neutral";
    }
}

export default function OrdersPage() {
    const initialData = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof loader>();
    const isLoading = fetcher.state !== "idle"

    const data = fetcher.data ?? initialData

    const [search, setSearch] = useState(data.search)
    const [payment, setPayment] = useState(data.payment)
    const [fulfillment, setFulfillment] = useState(data.fulfillment)

    useEffect(() => {
        setSearch(data.search)
        setPayment(data.payment)
        setFulfillment(data.fulfillment)
    }, [data.search, data.payment, data.fulfillment])

    function applyFilters(
        nextSearch = search,
        nextPayment = payment,
        nextFulfillment = fulfillment,
    ) {
        const params = new URLSearchParams();

        console.log("Apply filters clicked", {
            search,
            payment,
            fulfillment,
        });

        if (nextSearch.trim()) params.set("q", nextSearch.trim());
        if (nextPayment !== "all") params.set("payment", nextPayment);
        if (nextFulfillment !== "all") params.set("fulfillment", nextFulfillment);

        fetcher.load(`/app/orders?${params.toString()}`);
    }

    const date = (value: string) =>
        new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(new Date(value))

    const money = (amount: string, currency: string) =>
        new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
        }).format(Number(amount))

    const pageSwapping = (direction: string) => {
        const params = new URLSearchParams()

        if (data.search) params.set("q", data.search)
        if (data.payment !== "all") params.set("payment", data.payment)
        if (data.fulfillment !== "all") {
            params.set("fulfillment", data.fulfillment)
        }

        if (direction === "next" && data.pageInfo.endCursor) {
            params.set("after", data.pageInfo.endCursor)
        }

        if (direction === "previous" && data.pageInfo.startCursor) {
            params.set("before", data.pageInfo.startCursor)
        }

        fetcher.load(`/app/orders?${params.toString()}`)
    }

    return (
        <s-page heading="Orders">
            <s-section>
                <s-stack direction="inline" gap="base" alignItems="end">
                    <s-box>
                        <s-text-field
                            label="Search orders"
                            placeholder="Order number or customer email"
                            value={search}
                            onChange={(event) => setSearch(event.currentTarget.value)}
                        />
                    </s-box>
                    <s-box>
                        <s-select
                            label="Payment status"
                            value={payment}
                            onChange={(event) => setPayment(event.currentTarget.value)}
                        >
                            <s-option value="all">All payment statuses</s-option>
                            <s-option value="paid">Paid</s-option>
                            <s-option value="pending">Pending</s-option>
                            <s-option value="authorized">Authorized</s-option>
                            <s-option value="partially_paid">Partially paid</s-option>
                            <s-option value="unpaid">Unpaid</s-option>
                            <s-option value="refunded">Refunded</s-option>
                            <s-option value="partially_refunded">Partially refunded</s-option>
                        </s-select>
                    </s-box>
                    <s-box>
                        <s-select
                            label="Fulfillment status"
                            value={fulfillment}
                            onChange={(event) => setFulfillment(event.currentTarget.value)}
                        >
                            <s-option value="all">All fulfillment statuses</s-option>
                            <s-option value="unfulfilled">Unfulfilled</s-option>
                            <s-option value="fulfilled">Fulfilled</s-option>
                            <s-option value="partial">Partially fulfilled</s-option>
                            <s-option value="scheduled">Scheduled</s-option>
                            <s-option value="on_hold">On hold</s-option>
                        </s-select>
                    </s-box>

                    <s-button
                        variant="primary"
                        onClick={() => applyFilters()}
                        disabled={isLoading}
                    >
                        Apply filters
                    </s-button>

                    <s-button
                        onClick={() => {
                            setSearch("")
                            setPayment("all")
                            setFulfillment("all")
                            applyFilters("", "all", "all")
                        }}
                        disabled={isLoading}
                    >
                        Clear
                    </s-button>
                </s-stack>
            </s-section>
            <s-section heading="Recent orders">
                {isLoading && <s-spinner accessibilityLabel="Loading orders" />}

                {!data.orders.length ? (
                    <s-banner tone="info">
                        No orders match these filters.
                    </s-banner>
                ) : (
                    <s-table>
                        <s-table-header-row>
                            <s-table-header listSlot="primary">Order</s-table-header>
                            <s-table-header>Customer</s-table-header>
                            <s-table-header>Date</s-table-header>
                            <s-table-header>Payment</s-table-header>
                            <s-table-header>Fulfillment</s-table-header>
                            <s-table-header>Total</s-table-header>
                        </s-table-header-row>
                        <s-table-body>
                            {data.orders.map((order) => (
                                <s-table-row key={order.id}>
                                    <s-table-cell>
                                        <s-link href={`/app/orders/${order.id}`}>{order.name}</s-link>
                                    </s-table-cell>
                                    <s-table-cell>
                                        <s-stack gap="small">
                                            <s-text>{order.customer?.displayName ?? "Guest"}</s-text>
                                            {order.customer?.email && (
                                                <s-text color="subdued">
                                                    {order.customer.email}
                                                </s-text>
                                            )}
                                        </s-stack>
                                    </s-table-cell>
                                    <s-table-cell>{date(order.createdAt)}</s-table-cell>
                                    <s-table-cell>
                                        <span
                                            className={`order-status ${statusLable(
                                                order.displayFinancialStatus,
                                            )}`}
                                        >
                                            {statusLable(order.displayFinancialStatus)}
                                        </span>
                                    </s-table-cell>
                                    <s-table-cell>
                                        <span
                                            className={`order-status ${statusClass(
                                                order.displayFulfillmentStatus,
                                            )}`}
                                        >
                                            {statusLable(order.displayFulfillmentStatus)}
                                        </span>
                                    </s-table-cell>
                                    <s-table-cell>
                                        {money(
                                            order.totalPriceSet.shopMoney.amount,
                                            order.totalPriceSet.shopMoney.currencyCode
                                        )}
                                    </s-table-cell>
                                </s-table-row>
                            ))}
                        </s-table-body>
                    </s-table>
                )}

                <s-stack direction="inline" gap="base" alignItems="center">
                    <s-text color="subdued">
                        Showing {data.orders.length} orders on this page
                    </s-text>

                    {data.pageInfo.hasPreviousPage && (
                        <s-button
                            disabled={!data.pageInfo.hasPreviousPage || isLoading}
                            onClick={() => pageSwapping("previous")}
                        >
                            Previous
                        </s-button>
                    )}

                    {data.pageInfo.hasNextPage && data.pageInfo.endCursor && (
                        <s-button
                            disabled={!data.pageInfo.hasNextPage || isLoading}
                            onClick={() => pageSwapping("next")}
                        >
                            Next
                        </s-button>
                    )}
                </s-stack>
            </s-section>

            <style>{`
                .order-status {
                    display: inline-block;
                    padding: 4px 8px;
                    border-radius: 999px;
                    font-size: 12px;
                    font-weight: 500;
                    white-space: nowrap;
                }

                .status-success {
                    background: #d1fae5;
                    color: #065f46;
                }

                .status-warning {
                    background: #fef3c7;
                    color: #92400e;
                }

                .status-neutral {
                    background: #e5e7eb;
                    color: #374151;
                }
      `}</style>
        </s-page>
    )
}


