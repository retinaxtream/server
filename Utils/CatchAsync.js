export const CatchAsync = fn => {
    return async (req, res, next) => {
        try {
            await fn(req, res, next);
        } catch (error) {
            res.status(500).json({ error: 'An error occurred' });
            next(error); // Call next with the error to pass it to the error handler
        }
    };
};
