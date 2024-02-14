import { ApolloServer } from "@apollo/server";
import bodyParser from "body-parser";
import cors from "cors";
import { expressMiddleware } from "@apollo/server/express4";
import express from "express";

import { User } from "./user";
import { Tweet } from "./tweet";
import { GraphqlContext } from "../interfaces";
import JWTService from "../services/jwt";

export async function initServer() {
  const app = express();

  app.use(bodyParser.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cors());

  const server = new ApolloServer<GraphqlContext>({
    typeDefs: `
    ${User.types}
    ${Tweet.types}
    type Query {
      ${User.queries}
      ${Tweet.queries}
    }
    type Mutation {
      ${Tweet.mutations}
      ${User.mutations}
    }
    `,
    resolvers: {
      Query: {
        ...User.resolvers.queries,
        ...Tweet.resolvers.queries,
      },
      Mutation: {
        ...Tweet.resolvers.mutations,
        ...User.resolvers.mutations,
      },
      ...Tweet.resolvers.extraResolvers,
      ...User.resolvers.extraResolvers,
    },
  });

  await server.start();

  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req, res }) => {
        try {
          return {
            user: req.headers.authorization
              ? JWTService.decodeToken(
                  req.headers.authorization.split("Bearer ")[1]
                )
              : undefined,
          };
        } catch (error) {
          console.log(error);
          return {
            data: {
              verifyGoogleToken: "failed",
            },
          };
        }
      },
    })
  );
  return app;
}
