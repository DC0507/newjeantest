const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const { URL } = require("url");

app.http('users-getNetworkLeaders', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users/network-leaders/{userId}',
    handler: async (request, context) => {
        try {
            await initializeCosmosDb();
            let userId = context.bindingData?.userId;
  
            if (!userId) {
                const parsedUrl = new URL(request.url);
                const pathSegments = parsedUrl.pathname.split('/');
                userId = pathSegments.pop();
            }
  
            if (!userId) {
                context.log.error("Missing userId in route or request.");
                return {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'UserId is required in the route.' }),
                };
            }
  
            const container = getContainer();
  
            // Fetch the user's following list
            const userQuerySpec = {
                query: `
                    SELECT c.following 
                    FROM c 
                    WHERE c.type = 'user' AND c.id = @userId
                `,
                parameters: [{ name: '@userId', value: userId }],
            };
  
            const { resources: users } = await container.items.query(userQuerySpec).fetchAll();
            if (!users[0]?.following?.length) {
                context.log("No following list found for user:", userId);
                return {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify([]),
                };
            }
  
            const followingIds = users[0].following.map((f) => f.id);
            followingIds.push(userId); // Include the user's own goals
  
            // Build query for following goals
            const inClause = followingIds.map((_, index) => `@id${index}`).join(", ");
            const goalParameters = followingIds.map((id, index) => ({
                name: `@id${index}`,
                value: id,
            }));
  
            const goalQuerySpec = {
                query: `
                    SELECT c.userId, c.goalId, c.goalName, ARRAY_LENGTH(c.completedDays) AS completedDays
                    FROM c 
                    WHERE c.type = 'goal' 
                      AND c.userId IN (${inClause}) 
                      AND (c.isDeleted = false OR NOT IS_DEFINED(c.isDeleted))
                      AND (c.isPrivate = false OR NOT IS_DEFINED(c.isPrivate))
                `,
                parameters: goalParameters,
            };
  
            const { resources: goals } = await container.items.query(goalQuerySpec).fetchAll();
  
            // Handle cases where no goals are found
            if (!goals || goals.length === 0) {
                context.log("No goals found for the user's network:", followingIds);
                return {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify([]),
                };
            }
  
            // Extract unique userIds from goals
            const uniqueUserIds = [...new Set(goals.map((g) => g.userId))];
  
            // Fetch usernames for all unique userIds
            const userInClause = uniqueUserIds.map((_, index) => `@id${index}`).join(", ");
            const userParameters = uniqueUserIds.map((id, index) => ({
                name: `@id${index}`,
                value: id,
            }));
  
            const usernameQuerySpec = {
                query: `
                    SELECT c.id as userId, c.username
                    FROM c 
                    WHERE c.type = 'user' AND c.id IN (${userInClause})
                `,
                parameters: userParameters,
            };
  
            const { resources: userRecords } = await container.items.query(usernameQuerySpec).fetchAll();
  
            // Map userId to username
            const userMap = userRecords.reduce((map, user) => {
                map[user.userId] = user.username;
                return map;
            }, {});
  
            // Attach username to each goal
            const response = goals.map((goal) => ({
                ...goal,
                username: userMap[goal.userId] || 'Unknown', // Fallback if username is not found
            }));
  
            return {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            context.log.error('Error fetching network leaders:', error.message, error.stack);
            // Return 500 status code for unexpected errors
            return {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Internal Server Error', details: error.message }),
            };
        }
    },
  });
  