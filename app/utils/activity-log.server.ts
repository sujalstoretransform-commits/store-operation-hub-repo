import prisma from '../db.server'

type LogActivityInput = {
    shop: string;
    action: string;
    description: string;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
};

export const logActivity = async (input: LogActivityInput) => {
    return prisma.activityLog.create({
        data: {
            shop: input.shop,
            action: input.action,
            description: input.description,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            resourceName: input.resourceName,
        }
    })
}

export const getRecentActivites = async (shop: string, limit = 20) => {
    return prisma.activityLog.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: limit
    })
}