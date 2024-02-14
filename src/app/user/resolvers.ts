import axios from "axios";
import { prismaClient } from "../../clients/db";
import JWTService from "../../services/jwt";
import { GraphqlContext } from "../../interfaces";
import { User } from "@prisma/client";

interface GoogleTokenResult {
  iss?: string;
  azp?: string;
  aud?: string;
  sub?: string;
  email: string;
  email_verified: string;
  nbf?: string;
  name?: string;
  picture?: string;
  given_name: string;
  family_name?: string;
  locale?: string;
  iat?: string;
  exp?: string;
  jti?: string;
  alg?: string;
  kid?: string;
  typ?: string;
}

const queries = {
  verifyGoogleToken: async (parent: any, { token }: { token: string }) => {
    // console.log(token);
    const googleToken = token;
    const googleOAuthURL = new URL("https://oauth2.googleapis.com/tokeninfo");
    googleOAuthURL.searchParams.set("id_token", googleToken);

    const { data } = await axios.get<GoogleTokenResult>(
      googleOAuthURL.toString(),
      {
        responseType: "json",
      }
    );
    console.log(data);
    const user = await prismaClient.user.findUnique({
      where: {
        email: data.email,
      },
    });
    if (!user) {
      await prismaClient.user.create({
        data: {
          email: data.email,
          firstName: data.given_name,
          lastName: data.family_name || "",
          profileImageURL: data.picture,
        },
      });
    }
    const userInDb = await prismaClient.user.findUnique({
      where: {
        email: data.email,
      },
    });

    if (!userInDb) throw new Error("User in Database not Found");

    const usertoken = JWTService.generateTokenForUser(userInDb);

    return usertoken;
  },
  getCurrentUser: async (parent: any, args: any, ctx: GraphqlContext) => {
    const id = ctx.user?.id;
    console.log(ctx);
    if (!id) return null;
    // return ctx.user;

    const user = await prismaClient.user.findUnique({ where: { id } });
    console.log("here!");
    console.log(user);
    // const newData = JSON.parse(user)

    return user;
  },
};

const extraResolvers = {
  User: {
    tweets: async (parent: User) => {
      return await prismaClient.tweet.findMany({
        where: { author: { id: parent.id } },
      });
    },
  },
};

export const resolvers = { queries, extraResolvers };
