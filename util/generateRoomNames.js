var names = [
  "apple",
  "orange",
  "pear",
  "fig",
  "prune",
  "lime",
  "olive",
  "melon",
  "mango",
  "kiwi",
  "plum",
  "berry",
  "guava",
  "grape",
  "date",
  "apricot",
  "lychee",
  "peach",
  "papaya",
  "tomato",
  "loquat",
  "banana",
  "persimmon",
  "quince",
  "pineapple",
  "watermelon",
  "wolfberry",
  "longan",
  "kumquat",
  "jackfruit",
  "honeydew",
];

module.exports = (n = 5) => {
  let candidates = [];
  for (var i = 0; i < n; i++) {
    let roomName1 = names[Math.floor((names.length - 1) * Math.random())];
    let roomName2 = names[Math.floor((names.length - 1) * Math.random())];
    candidates.push(`${roomName1}-${roomName2}`);
  }
  return candidates;
};
