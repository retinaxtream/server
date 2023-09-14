import express from 'express';
import morgan from 'morgan';


const app = express();
app.use(express.json());



app.use(morgan('dev'));

app.use((req,res,next)=>{
    console.log('Hello from the middlewear 👋');
    next();
})

const userRouters = (req,res)=>{
    res.status(200)
        .json({
            status:"success",
            message: 'Hello from the retina server',
            app: "Retina"
        });
};

app.route('/api/v1/user').get(userRouters)

// app.get('/api/v1/user', (req, res) => {
//     res.status(200)
//         .json({
//             status:"success",
//             message: 'Hello from the retina server',
//             app: "Retina"
//         });
// })

const port = 8000
app.listen(port, () => {
    console.log(`App runnung on port ${port}`);
})