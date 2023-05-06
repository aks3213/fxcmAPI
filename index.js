const FXConnectLite = require("@gehtsoft/forex-connect-lite-node");

const timeout = 5000;
const user = "701759855";
const password = "v6Jzt";
const tradingSystemUrl = "http://www.fxcorporate.com";
const connectionName = "Demo";

exports.handler = async (event, context) => {

    let obj = JSON.parse(event.body)
    console.log("parsed obj", obj)
    const symbol = obj.symbol;
    const amount = obj.amount;
    let action = obj.action;

    if (action.toLowerCase() == "buy") {
        action = "B"
    } else if (action.toLocaleLowerCase() == "sell") {
        action = "S"
    } else {
        return {
            statusCode: 501,
            body: JSON.stringify({ message: "unknown action" }),
        };
    }

    const session = FXConnectLite.FXConnectLiteSessionFactory.create("EntryOrderSample");
    console.log("Login...");
    try {
        await login(session, user, password, tradingSystemUrl, connectionName, new LoginCallback());

        if (session.getConnectionStatus().isConnected()) {
            await update(session);

            const openPositionManager = session.getOpenPositionsManager();
            const openPositionChangeListener = new OpenPositionChangeListener(openPositionManager);
            openPositionManager.subscribeOpenPositionChange(openPositionChangeListener);

            const instrument = session.getInstrumentsManager().getInstrumentBySymbol(obj.symbol);
            console.log("instrument details: ", instrument)

            let openPositions = openPositionManager.getOpenPositionsSnapshot()

            console.log("number of open positions: ", openPositions.length)

            for (let index = 0; index < openPositions.length; index++) {
                console.log("-<>-", openPositions[index])

                if (openPositions[index].getOfferId() == instrument.getOfferId()) {
                    console.log("cancelling already open position: ", openPositions[index].getTradeID())
                    await ClosePosition(session, openPositions[index].getTradeID())
                    
                }
            }

            await placeMarketOrder(session, instrument.getOfferId(), amount, action)
            console.log("Place entry order...");

            await waiting(timeout); // required to check events on a real environment
            return {
                statusCode: 200,
                body: JSON.stringify({ message: "Order placed successfully" }),
            };
        }
    } catch (error) {
        console.error(error);

        return {
            statusCode: 500,
            body: JSON.stringify({ message: "An error occurred", error: error.message }),
        };
    }
    return {
        statusCode: 500,
        body: JSON.stringify({ message: "An error occurred" }),
    };
};




// The handler
const CompleteLoadingHandler = function (resolve, countManagers, timeout) {
    const me = this;
    let counter = 0;
    this.resolve = resolve;
    this.timeoutHandler = setTimeout(function () {
        me.resolve();
    }, timeout);
    this.onStateChange = function (state) {
        if (state.isLoaded()) {
            if (++counter >= countManagers) {
                clearTimeout(me.timeoutHandler);
                me.resolve();
            }
        }
    };
};

// The handler
const CompleteLoginConnectionStatusChangeListener = function (completeLoginResolve, loginReject, session) {
    this.completeLoginResolve = completeLoginResolve;
    this.loginReject = loginReject;
    this.session = session;

    this.onConnectionStatusChange = function (status) {
        if (status.isConnected()) {
            this.session.unsubscribeConnectionStatusChange(this);
            this.completeLoginResolve();
        } else if (status.isDisconnected()) {
            this.session.unsubscribeConnectionStatusChange(this);
            this.loginReject();
        }
    };
};

const LoginCallback = function () {
    this.onLoginError = function (error) {
        console.log(`Login error: ${error.getMessage()} (${error.getCode()})`);
        throw Error(`Login error: ${error.getMessage()} (${error.getCode()})`)
    };
};

const OpenPositionFormatter = {
    formatByIndex: function (index, openPosition) {
        let formatString = `${index} | ${openPosition.getTradeID()} | ${openPosition.getAccountId()} | ${openPosition.getUsedMargin()} | ${openPosition.getAmount()} | ${openPosition.getBuySell()} | ${openPosition.getOpenRate()} | ${openPosition.getCloseRate()} | ${openPosition.getStopRate()} | ${openPosition.getLimitRate()} |`;
        return formatString;
    },
    format: function (openPosition) {
        let formatString = `${openPosition.getTradeID()} | ${openPosition.getAccountId()} | ${openPosition.getUsedMargin()} | ${openPosition.getAmount()} | ${openPosition.getBuySell()} | ${openPosition.getOpenRate()} | ${openPosition.getCloseRate()} | ${openPosition.getStopRate()} | ${openPosition.getLimitRate()} |`;
        return formatString;
    },
    TITLE: "# | TradeID | AccountId | UsedMargin | Amount | BuySell | OpenRate | CloseRate | StopRate | LimitRate",
};

const OpenPositionChangeListener = function (openPositionsManager) {
    this.openPositionsManager = openPositionsManager;

    this.onChange = function (openPositionInfo) {
        // Do nothing
    };

    this.onAdd = function (openPositionInfo) {
        const openPosition = this.openPositionsManager.getOpenPosition(openPositionInfo.getId());
        console.log(`OpenPosition ${openPositionInfo.getId()} added.`);
        console.log(OpenPositionFormatter.TITLE);
        console.log(OpenPositionFormatter.format(openPosition));
    };

    this.onDelete = function (openPositionInfo) {
        const openPosition = this.openPositionsManager.getOpenPosition(openPositionInfo.getId());
        console.log(`OpenPosition ${openPositionInfo.getId()} deleted.`);
        console.log(OpenPositionFormatter.TITLE);
        console.log(OpenPositionFormatter.format(openPosition));
    };

    this.onRefresh = function () {
        // Do nothing
    };
};


const login = async function (session, user, password, tradingSystemUrl, connectionName, loginCallback) {
    return new Promise((resolve, reject) => {
        session.subscribeConnectionStatusChange(
            new CompleteLoginConnectionStatusChangeListener(resolve, reject, session)
        );
        session.login(user, password, tradingSystemUrl, connectionName, loginCallback);
    });
};

const placeMarketOrder = async function (session, offerId, amount, action) {
    return new Promise((resolve, reject) => {
        var accountsManager = session.getAccountsManager();
        var account = accountsManager.getAccountById(accountsManager.getAccountsInfo()[0].getId());
        var manager = session.getOrdersManager();
        var offersManager = session.getOffersManager();

        request = MarketOrderFactory.create(manager, offersManager, account.getAccountId(), offerId, amount, action);
        manager.createOpenMarketOrder(request);
        resolve();
    });
};

const MarketOrderFactory = {
    create: function (manager, offersManager, accountId, offerId, amount, action) {
        return manager.getRequestFactory().createMarketOrderRequestBuilder()
            .setAccountId(accountId)
            .setAmount(amount)
            .setOfferId(offerId)
            .setBuySell(action)
            .setTimeInForce('IOC')
    }
}

var ClosePosition = async function(session, tradeId) {

    return new Promise((resolve, reject) => {
        console.log("Closing position...");
        var ordersManager = session.getOrdersManager();
        var openPositionManager = session.getOpenPositionsManager();
        var openPosition = openPositionManager.getOpenPosition(tradeId);
        var request = ClosePositionFactory.create(ordersManager, tradeId, openPosition.getAmount());
        ordersManager.createCloseMarketOrder(request);
        resolve()
    });
};

const ClosePositionFactory = {
    create: function (manager, tradeId, amount) {
        return manager.getRequestFactory().createCloseMarketOrderRequestBuilder()
            .setTradeId(tradeId)
            .setAmount(amount)
            .setRateRange(10)
            .setTimeInForce('IOC')
            .setCustomId('custom-id-close')
            .build();
    }
}

const update = async function (session) {
    return new Promise((resolve, reject) => {
        const completeHandler = new CompleteLoadingHandler(resolve, 5, timeout);
        session.getInstrumentsManager().subscribeStateChange(completeHandler);
        session.getInstrumentsManager().refresh();
        session.getOffersManager().subscribeStateChange(completeHandler);
        session.getOffersManager().refresh();
        session.getOpenPositionsManager().subscribeStateChange(completeHandler);
        session.getOpenPositionsManager().refresh();
        session.getOrdersManager().subscribeStateChange(completeHandler);
        session.getOrdersManager().refresh();
        session.getAccountCommissionsManager().subscribeStateChange(completeHandler);
        session.getAccountCommissionsManager().refresh();
    });
};

const waiting = async function (time) {
    return new Promise((resolve, reject) => {
        setTimeout(function () {
            resolve();
        }, time);
    });
};