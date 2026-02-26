/*
Copyright 2017 - 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
    http://aws.amazon.com/apache2.0/
or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and limitations under the License.
*/

/* Amplify Params - DO NOT EDIT
	ENV
	REGION
	STORAGE_BOOKREVIEWAPI_ARN
	STORAGE_BOOKREVIEWAPI_NAME
	STORAGE_BOOKREVIEWAPI_STREAMARN
Amplify Params - DO NOT EDIT */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const awsServerlessExpressMiddleware = require("aws-serverless-express/middleware");
const bodyParser = require("body-parser");
const express = require("express");
const { randomUUID } = require("crypto");

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const tableName = process.env.STORAGE_BOOKREVIEWAPI_NAME || "BookReviewTable";
const partitionKeyName = "id";
const path = "/items";

const app = express();
app.use(bodyParser.json({ limit: "2mb" }));
app.use(awsServerlessExpressMiddleware.eventContext());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  next();
});

app.options(path, (_, res) => res.status(200).send(""));
app.options(path + "/:id", (_, res) => res.status(200).send(""));

const getUserId = (req) =>
  req.query?.userId ||
  req.body?.userId ||
  req.apiGateway?.event?.requestContext?.identity?.cognitoIdentityId ||
  null;

const normalizeBook = (payload, id) => {
  const safe = payload || {};
  return {
    id: id || safe.id || randomUUID(),
    order: Number(safe.order) || 0,
    title: String(safe.title || "").trim(),
    author: String(safe.author || "").trim(),
    rating: Number(safe.rating) || 3,
    tags: Array.isArray(safe.tags) ? safe.tags : [],
    affiliateUrl: String(safe.affiliateUrl || "").trim(),
    rakutenUrl: String(safe.rakutenUrl || "").trim(),
    coverImage: String(safe.coverImage || "").trim(),
    notes: safe.notes || { selectionBackground: [], impressions: [] },
  };
};

app.get(path, async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(400).json({ error: "userId_required" });
    return;
  }
  const params = {
    TableName: tableName,
    FilterExpression: "userId = :userId",
    ExpressionAttributeValues: {
      ":userId": userId,
    },
  };
  try {
    const data = await ddbDocClient.send(new ScanCommand(params));
    res.json(data.Items || []);
  } catch (err) {
    res.status(500).json({ error: "Could not load items: " + err.message });
  }
});

app.get(path + "/:id", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(400).json({ error: "userId_required" });
    return;
  }
  const params = {
    TableName: tableName,
    Key: {
      [partitionKeyName]: req.params.id,
    },
  };
  try {
    const data = await ddbDocClient.send(new GetCommand(params));
    if (!data.Item || data.Item.userId !== userId) {
      res.json(null);
      return;
    }
    res.json(data.Item || null);
  } catch (err) {
    res.status(500).json({ error: "Could not load item: " + err.message });
  }
});

app.post(path, async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(400).json({ error: "userId_required" });
    return;
  }
  const book = normalizeBook(req.body);
  book.userId = userId;
  const params = {
    TableName: tableName,
    Item: book,
  };
  try {
    await ddbDocClient.send(new PutCommand(params));
    res.json(book);
  } catch (err) {
    res.status(500).json({ error: "Could not create item: " + err.message });
  }
});

app.put(path + "/:id", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(400).json({ error: "userId_required" });
    return;
  }
  const book = normalizeBook(req.body, req.params.id);
  book.userId = userId;
  const params = {
    TableName: tableName,
    Item: book,
  };
  try {
    await ddbDocClient.send(new PutCommand(params));
    res.json(book);
  } catch (err) {
    res.status(500).json({ error: "Could not update item: " + err.message });
  }
});

app.delete(path + "/:id", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(400).json({ error: "userId_required" });
    return;
  }
  const key = {
    [partitionKeyName]: req.params.id,
  };
  try {
    const existing = await ddbDocClient.send(
      new GetCommand({ TableName: tableName, Key: key })
    );
    if (!existing.Item || existing.Item.userId !== userId) {
      res.json({ success: false });
      return;
    }
    await ddbDocClient.send(
      new DeleteCommand({ TableName: tableName, Key: key })
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Could not delete item: " + err.message });
  }
});

app.listen(3000, function () {
  console.log("App started");
});

module.exports = app;
