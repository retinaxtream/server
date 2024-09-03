export const CatchAsync = (fn) => {
    return (req, res, next) => {
      // Ensure fn is a promise
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };
  