package com.sonoraport.worldclock

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.sonoraport.worldclock.swarm.SwarmCoordinator

class MainActivity : AppCompatActivity() {

    private lateinit var swarmCoordinator: SwarmCoordinator

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        swarmCoordinator = SwarmCoordinator(applicationContext)
        swarmCoordinator.initialize()
    }
}
