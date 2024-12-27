const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("goals-getGoalsByUserId", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "goals/{userId}",
    handler: async (request, context) => {
        await initializeCosmosDb();

        // Extract userId from context.bindingData or fallback to extracting it from the URL
        let userId = context.bindingData?.userId;
        if (!userId) {
            const url = new URL(request.url); // Use the URL API
            const pathSegments = url.pathname.split('/');
            userId = pathSegments[pathSegments.length - 1]; // Get the last segment
        }

        context.log('getGoalsForUser userId: ', userId);

        // Validate userId
        if (!userId || userId === "undefined") {
            return {
                status: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Invalid or missing user ID." }),
            };
        }

        try {
            const container = getContainer();

            // Ensure the partition key is correctly specified
            const querySpec = {
                query: `
                    SELECT *
                    FROM c
                    WHERE c.type = @type
                      AND c.userId = @userId
                      AND (IS_NULL(c.isDeleted) OR c.isDeleted = false)
                `,
                parameters: [
                    { name: "@type", value: "goal" }, // Partition key value
                    { name: "@userId", value: userId }
                ],
            };

            // Fetch items with the correct partition key value
            const { resources: goals } = await container.items
                .query(querySpec, { partitionKey: "goal" })
                .fetchAll();

            context.log("Fetched goals:", goals);

            return {
                status: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(goals),
            };
        } catch (error) {
            context.log("Error fetching goals:", error.message);
            return {
                status: 500,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Internal Server Error" }),
            };
        }
    },
});
