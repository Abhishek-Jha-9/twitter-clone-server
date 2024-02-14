import { prismaClient } from "../clients/db";

class UserService {
  public static followUser(from: string, to: string) {
    console.log(
      `Inside the followUser method of UserService from the server \n`
    );
    return prismaClient.follows.create({
      data: {
        followers: { connect: { id: from } },
        following: { connect: { id: to } },
      },
    });
  }
  public static unfollowUser(from: string, to: string) {
    console.log(
      `Inside the unFollowUser method of UserService from the server \n`
    );
    return prismaClient.follows.delete({
      where: {
        followerId_followingId: { followerId: from, followingId: to },
      },
    });
  }
}

export default UserService;
