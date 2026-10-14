import { useLoaderData, type LoaderFunctionArgs, } from "react-router";
import { authenticate } from "../shopify.server";
import { getRecentActivites } from "app/utils/activity-log.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);

    const activities = await getRecentActivites(session.shop, 20)

    return { activities };
};

export default function ActivityPage() {
    const { activities } = useLoaderData<typeof loader>()

    const formatDate = (value: string | Date) =>
        new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(value));

    return (
        <s-page heading="Activity Log">
            <s-section heading="Recent activity">
                {activities.length === 0 ? (
                    <s-banner tone="info">
                        No activity has been recorded yet.
                    </s-banner>
                ) : (
                    <s-table>
                        <s-table-header-row>
                            <s-table-header>Activity</s-table-header>
                            <s-table-header>Resource</s-table-header>
                            <s-table-header>Date</s-table-header>
                        </s-table-header-row>
                        <s-table-body>
                            {activities.map((activity) => (
                                <s-table-row key={activity.id}>
                                    <s-table-cell>
                                        <s-stack gap="small">
                                            <s-text>{activity.description}</s-text>
                                            <s-text>{activity.action}</s-text>
                                        </s-stack>
                                    </s-table-cell>
                                    <s-table-cell>
                                        {activity.resourceName ?? activity.resourceType ?? "-"}
                                    </s-table-cell>
                                    <s-table-cell>
                                        {formatDate(activity.createdAt)}
                                    </s-table-cell>
                                </s-table-row>
                            ))}
                        </s-table-body>
                    </s-table>
                )}
            </s-section>
        </s-page>
    )
}




