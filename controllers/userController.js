

export const userWelcome = (req, res) => {
    res.status(200).json({
        status: "success",
        message: 'Hello from the retina server',
        app: "Retina"
    });
};



