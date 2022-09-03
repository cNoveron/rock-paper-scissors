# Rock Paper Scissors

This project shows how to implement the classical game on the blockcahin.

## Quick start

The first things you need to do are cloning this repository and installing its
dependencies:

```sh
git clone https://github.com/nomiclabs/hardhat-hackathon-boilerplate.git
cd hardhat-hackathon-boilerplate
npm install
```

Once installed, let's run Hardhat's testing network:

```sh
npx hardhat node
```

Then, on a new terminal, go to the repository's root folder and run this to
deploy your contract:

```sh
npx hardhat run scripts/deploy.js --network localhost
```

Finally, we can run the frontend with:

```sh
cd frontend
npm install
npm start
```

Note: Sadly, I didn't have time to implement the front end.

## Running the tests

To run the tests, run this the repository's root folder:

```sh
npx hardhat test test/Test.js --network localhost
```