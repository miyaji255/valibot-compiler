export const invalid = {
  expected: { success: false, issuesCount: 3 },
  data: {
    one: [
      {
        items: [
          {
            val: "aaaaaaaaaaaaaaaa",
            str: "bbbbbbbbbbbbbbbb",
            num: 9999999,
          },
        ],
      },
    ],
  },
};

export const valid = {
  expected: { success: true },
  data: {
    one: [
      {
        items: [
          {
            val: "hello",
            str: "abc",
            num: 123,
          },
          {
            val: "hello",
            str: "abcd",
            num: 155,
          },
          {
            val: "world",
            str: "abc",
            num: 123,
          },
          {
            val: "hello",
            str: "abc",
            num: 199,
          },
        ],
      },
    ],
  },
};
