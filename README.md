# Hapzea Server

This repository contains the code for the server component of the Hapzea project. It handles all backend operations, including API endpoints, database interactions, and authentication.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Features](#features)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Installation

To set up the server locally, follow these steps:

1. Clone the repository:
    ```bash
    git clone https://github.com/retinaxtream/server.git
    cd server
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Set up environment variables:
    - Create a `.env` file in the root directory.
    - Add the necessary environment variables as specified in `.env.example`.

4. Start the server in development mode:
    ```bash
    npm run start:dev
    ```

## Usage

Once the server is running, you can access the API endpoints at `http://localhost:3000`. Refer to the documentation for details on available endpoints and their usage.

## Features

- **User Authentication**: Secure user login and registration.
- **Database Integration**: Seamless interaction with MongoDB using Mongoose.
- **RESTful API**: Comprehensive set of endpoints for various operations.
- **File Uploads**: Handle file uploads using Multer.
- **Scheduling**: Schedule tasks using Node-Cron.
- **Email Notifications**: Send emails using Nodemailer.
- **WebSockets**: Real-time communication using Socket.io.
- **Logging**: Logging with Pino and Winston.
- **Security**: Enhanced security with Helmet, XSS-Clean, and more.

## Contributing

We welcome contributions from the community. To contribute, follow these steps:

1. Fork the repository.
2. Create a new branch:
    ```bash
    git checkout -b feature/your-feature-name
    ```

3. Make your changes and commit them:
    ```bash
    git commit -m "Add your commit message"
    ```

4. Push to the branch:
    ```bash
    git push origin feature/your-feature-name
    ```

5. Create a pull request.

## License

This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for more details.

## Acknowledgements

We would like to thank all the contributors who have helped in the development of this project.
