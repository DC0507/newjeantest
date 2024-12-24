const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const querystring = require("querystring");

app.http("notifications-getUserNotificationsWithDetails", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "notifications/details/{userId}",
  handler: async (request, context) => {
    await initializeCosmosDb();
    const container = getContainer();

    const limit = parseInt(request.query.limit || "10");
    let rawContinuationToken = request.query.continuationToken || null;

    if (!rawContinuationToken) {
      const urlParams = querystring.parse(request.url.split("?")[1]);
      rawContinuationToken = urlParams.continuationToken || null;
    }

    const userId = context.bindingData?.userId || request.url.split("?")[0].split("/")[6];

    if (!userId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "User ID is required in the route." }),
      };
    }

    try {
      const notificationQuerySpec = {
        query: `
          SELECT c.id, c.fromUserId, c.postId, c.notificationType, c.timestamp, c.isRead, c.type
          FROM c
          WHERE c.type = 'notification' AND c.toUserId = @userId
          ORDER BY c.timestamp DESC
        `,
        parameters: [{ name: "@userId", value: userId }],
      };

      const queryOptions = {
        maxItemCount: limit,
        continuationToken: rawContinuationToken,
        enableCrossPartitionQuery: true,
      };

      const { resources: notifications, continuationToken: nextToken } = await container.items
        .query(notificationQuerySpec, queryOptions)
        .fetchNext();

      if (notifications.length === 0) {
        return {
          status: 404,
          body: JSON.stringify({ error: "No more notifications available." }),
        };
      }

      // Prepare detailed notifications
      const detailedNotifications = await Promise.all(
        notifications.map(async (notification) => {
          const { fromUserId, postId } = notification;
          let fromUser = null;
          let postDetails = null;
          let goalDetails = null;

          if (fromUserId) {
            const userQuerySpec = {
              query: `
                SELECT c.id, c.username, c.name, c.userImageUri
                FROM c
                WHERE c.type = 'user' AND c.id = @fromUserId
              `,
              parameters: [{ name: "@fromUserId", value: fromUserId }],
            };
            const { resources: users } = await container.items
              .query(userQuerySpec)
              .fetchAll();
            fromUser = users[0] || null;
          }

          if (notification.notificationType === "Like" && postId) {
            const postQuerySpec = {
              query: `
                SELECT c.id, c.goalId, c.isUserPost
                FROM c
                WHERE c.type = 'post' AND c.id = @postId
              `,
              parameters: [{ name: "@postId", value: postId }],
            };
            const { resources: posts } = await container.items
              .query(postQuerySpec)
              .fetchAll();
            postDetails = posts[0] || null;

            if (postDetails?.goalId) {
              const goalQuerySpec = {
                query: `
                  SELECT c.goalName, c.completionStreak
                  FROM c
                  WHERE c.type = 'goal' AND c.id = @goalId
                `,
                parameters: [{ name: "@goalId", value: postDetails.goalId }],
              };
              const { resources: goals } = await container.items
                .query(goalQuerySpec)
                .fetchAll();
              goalDetails = goals[0] || null;
            }
          }

          return {
            id: notification.id,
            fromUser,
            notificationType: notification.notificationType,
            timestamp: notification.timestamp,
            isRead: notification.isRead,
            postDetails: postDetails
              ? {
                  id: postDetails.id,
                  goalName: goalDetails?.goalName,
                  completionStreak: goalDetails?.completionStreak,
                  isUserPost: postDetails.isUserPost,
                }
              : null,
          };
        })
      );

      // Send the response to the client
      context.log("Returning notifications to client");
      const response = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notifications: detailedNotifications,
          continuationToken: nextToken || null,
          hasMore: !!nextToken,
        }),
      };

      // Mark notifications as read asynchronously
      Promise.all(
        notifications.map(async (notification) => {
          if (!notification.isRead) {
            notification.isRead = true; // Update in memory

            context.log("Marking notification as read:", {
              id: notification.id,
              type: notification.type,
            });

            try {
              await container.item(notification.id, notification.type).replace(notification);
              context.log("Successfully marked notification as read:", notification.id);
            } catch (error) {
              context.log("Failed to mark notification as read:", {
                id: notification.id,
                type: notification.type,
                error: error.message,
              });
            }
          }
        })
      );

      return response;
    } catch (error) {
      context.log("Error fetching detailed notifications:", error.message);
      return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Internal Server Error" }),
      };
    }
  },
});
