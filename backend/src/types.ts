export type Member = {
  socketId: string;
  nickname: string;
};

export type Room = {
  members: Member[];
};

export type RoomState = {
  code: string;
  members: Member[];
};
